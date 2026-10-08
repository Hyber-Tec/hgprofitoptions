/**
 * Scheduled market data work, shared by the Cloud Functions and scripts: store each session's bars,
 * refresh the tickers' high/low windows, and build Key Market Data when a week ends.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { mergeBars } from "@/core/calc/bars"
import { weeklyStats } from "@/core/calc/kmd"
import { tickerMetrics } from "@/core/calc/medians"
import { lastCompletedWeek } from "@/core/dates"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { COLLECTIONS, parseDoc, tickerBarsSchema, tickerSchema, type Ticker } from "../model"
import { fetchGroupedDaily, type MarketDataConfig } from "./provider"

async function activeTickers(db: Firestore): Promise<Ticker[]> {
  const snap = await db.collection(COLLECTIONS.tickers).where("active", "==", true).get()
  return snap.docs
    .map((d) => parseDoc(tickerSchema, d.id, d.data()))
    .filter((t): t is Ticker & { id: string } => t !== null && t.kind !== "index")
}

async function readBars(db: Firestore, symbols: readonly string[]): Promise<Map<string, DailyBar[]>> {
  const out = new Map<string, DailyBar[]>()
  for (let i = 0; i < symbols.length; i += 100) {
    const refs = symbols.slice(i, i + 100).map((s) => db.collection(COLLECTIONS.tickerBars).doc(s))
    if (refs.length === 0) continue
    for (const snap of await db.getAll(...refs)) {
      if (!snap.exists) continue
      const doc = parseDoc(tickerBarsSchema, snap.id, snap.data())
      if (doc) out.set(snap.id, doc.bars)
    }
  }
  return out
}

const providerMetrics = (bars: readonly DailyBar[], asOf: IsoDate, week: { start: IsoDate; end: IsoDate }) => {
  const metrics = tickerMetrics(bars, asOf, week)
  return metrics ? { ...metrics, price: null, source: "provider" as const } : null
}

/** Adds one session's bars for every active ticker and refreshes its metrics. Null on a market holiday. */
export async function ingestDailyBars(
  db: Firestore,
  config: MarketDataConfig,
  date: IsoDate,
  fetchImpl?: typeof fetch,
): Promise<{ updated: number; missing: string[] } | null> {
  const session = await fetchGroupedDaily(config, date, fetchImpl)
  if (session.size === 0) return null
  const tickers = await activeTickers(db)
  const history = await readBars(
    db,
    tickers.map((t) => t.symbol),
  )
  const week = lastCompletedWeek(date)
  const writer = db.bulkWriter()
  const missing: string[] = []
  let updated = 0
  for (const t of tickers) {
    const bar = session.get(t.symbol)
    if (!bar) {
      missing.push(t.symbol)
      continue
    }
    const bars = mergeBars(history.get(t.symbol) ?? [], [bar])
    void writer.set(db.collection(COLLECTIONS.tickerBars).doc(t.symbol), {
      symbol: t.symbol,
      bars,
      updatedAt: Timestamp.now(),
    })
    const metrics = providerMetrics(bars, date, week)
    if (metrics) void writer.update(db.collection(COLLECTIONS.tickers).doc(t.symbol), { metrics })
    updated++
  }
  await writer.close()
  return { updated, missing }
}

/**
 * Key Market Data for the week that ended on or before `today`, from the stored bars, and metrics
 * whose 5-day window rolls over to that week. Index values (entered by hand) are kept.
 */
export async function finalizeWeek(db: Firestore, today: IsoDate): Promise<{ weekStart: IsoDate; rows: number }> {
  const week = lastCompletedWeek(today)
  const tickers = await activeTickers(db)
  const history = await readBars(
    db,
    tickers.map((t) => t.symbol),
  )
  const rows: Record<string, { pfcp: number; high: number; low: number; close: number; range: number; svi: number }> =
    {}
  const writer = db.bulkWriter()
  for (const t of tickers) {
    const bars = history.get(t.symbol)
    const last = bars?.at(-1)
    if (!bars || !last) continue
    const stats = weeklyStats(bars, week)
    if (stats) {
      const { pfcp, high, low, close, range, svi } = stats
      rows[t.symbol] = { pfcp, high, low, close, range, svi }
    }
    const metrics = providerMetrics(bars, last.date, week)
    if (metrics) void writer.update(db.collection(COLLECTIONS.tickers).doc(t.symbol), { metrics })
  }
  await writer.close()
  const count = Object.keys(rows).length
  if (count > 0) {
    await db
      .collection(COLLECTIONS.weeks)
      .doc(week.start)
      .set(
        { weekStart: week.start, weekEnd: week.end, rows, source: "provider", computedAt: Timestamp.now() },
        { merge: true },
      )
  }
  return { weekStart: week.start, rows: count }
}
