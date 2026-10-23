/**
 * Scheduled market data work, shared by the Cloud Functions and scripts: store each session's bars,
 * refresh the tickers' high/low windows, and build Key Market Data when a week ends. Adding a ticker
 * fetches its history at once, so it shows up in every tool the same day.
 */
import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore"
import { mergeBars } from "@/core/calc/bars"
import { weeklyStats } from "@/core/calc/kmd"
import { tickerMetrics } from "@/core/calc/medians"
import { addDays, lastCompletedWeek } from "@/core/dates"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { COLLECTIONS, parseDoc, tickerBarsSchema, tickerSchema, type Ticker } from "../model"
import { fetchDailyRange, fetchGroupedDaily, fetchSplits, type MarketDataConfig } from "./provider"

/** Calendar days of history fetched for a new ticker or after a split: about 400 sessions. */
const HISTORY_DAYS = 600

async function activeTickers(db: Firestore): Promise<Ticker[]> {
  const snap = await db.collection(COLLECTIONS.tickers).where("active", "==", true).get()
  return snap.docs
    .map((d) => parseDoc(tickerSchema, d.id, d.data()))
    .filter((t): t is Ticker & { id: string } => t !== null && t.kind !== "index")
}

interface StoredBars {
  bars: DailyBar[]
  /** The newest split already reflected in the bars. */
  lastSplit: IsoDate | null
}

async function readBars(db: Firestore, symbols: readonly string[]): Promise<Map<string, StoredBars>> {
  const out = new Map<string, StoredBars>()
  for (let i = 0; i < symbols.length; i += 100) {
    const refs = symbols.slice(i, i + 100).map((s) => db.collection(COLLECTIONS.tickerBars).doc(s))
    if (refs.length === 0) continue
    for (const snap of await db.getAll(...refs)) {
      if (!snap.exists) continue
      const doc = parseDoc(tickerBarsSchema, snap.id, snap.data())
      if (doc) out.set(snap.id, { bars: doc.bars, lastSplit: doc.lastSplit })
    }
  }
  return out
}

const providerMetrics = (bars: readonly DailyBar[], asOf: IsoDate, week: { start: IsoDate; end: IsoDate }) => {
  const metrics = tickerMetrics(bars, asOf, week)
  return metrics ? { ...metrics, price: null, source: "provider" as const } : null
}

/**
 * Adds one session's bars for every active ticker and refreshes its metrics. A ticker whose split took
 * effect in the last week gets its whole split-adjusted history again, so the weeks around the split
 * never mix old and new share prices. Null on a market holiday.
 */
export async function ingestDailyBars(
  db: Firestore,
  config: MarketDataConfig,
  date: IsoDate,
  fetchImpl?: typeof fetch,
): Promise<{ updated: number; missing: string[]; resplit: string[] } | null> {
  const session = await fetchGroupedDaily(config, date, fetchImpl)
  if (session.size === 0) return null
  const tickers = await activeTickers(db)
  const history = await readBars(
    db,
    tickers.map((t) => t.symbol),
  )
  const splits = await fetchSplits(config, addDays(date, -7), date, fetchImpl)
  const universe = new Set(tickers.map((t) => t.symbol))
  const pendingSplit = new Map<string, IsoDate>()
  for (const s of splits) {
    if (!universe.has(s.symbol) || s.executionDate > date) continue
    const applied = history.get(s.symbol)?.lastSplit ?? null
    if (applied !== null && applied >= s.executionDate) continue
    if ((pendingSplit.get(s.symbol) ?? "") < s.executionDate) pendingSplit.set(s.symbol, s.executionDate)
  }

  const week = lastCompletedWeek(date)
  const writer = db.bulkWriter()
  const missing: string[] = []
  const resplit: string[] = []
  let updated = 0
  for (const t of tickers) {
    const bar = session.get(t.symbol)
    if (!bar) {
      missing.push(t.symbol)
      continue
    }
    const stored = history.get(t.symbol)
    const split = pendingSplit.get(t.symbol) ?? null
    let bars: DailyBar[]
    if (split) {
      const adjusted = await fetchDailyRange(config, t.symbol, addDays(date, -HISTORY_DAYS), date, fetchImpl)
      bars = mergeBars(adjusted, [bar])
      resplit.push(t.symbol)
    } else {
      bars = mergeBars(stored?.bars ?? [], [bar])
    }
    void writer.set(db.collection(COLLECTIONS.tickerBars).doc(t.symbol), {
      symbol: t.symbol,
      bars,
      lastSplit: split ?? stored?.lastSplit ?? null,
      updatedAt: Timestamp.now(),
    })
    const metrics = providerMetrics(bars, date, week)
    if (metrics) void writer.update(db.collection(COLLECTIONS.tickers).doc(t.symbol), { metrics })
    updated++
  }
  await writer.close()
  return { updated, missing, resplit }
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
    const bars = history.get(t.symbol)?.bars
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

/**
 * A new ticker's history (about 18 months up to `lastSession`), its metrics, and its row in the latest
 * Key Market Data week on file when that week is the last completed one.
 */
export async function backfillTicker(
  db: Firestore,
  config: MarketDataConfig,
  symbol: string,
  lastSession: IsoDate,
  fetchImpl?: typeof fetch,
): Promise<{ bars: number; addedToWeek: IsoDate | null }> {
  const fetched = await fetchDailyRange(config, symbol, addDays(lastSession, -HISTORY_DAYS), lastSession, fetchImpl)
  const bars = mergeBars([], fetched)
  const last = bars.at(-1)
  if (!last) return { bars: 0, addedToWeek: null }
  const week = lastCompletedWeek(addDays(lastSession, 1))
  await db
    .collection(COLLECTIONS.tickerBars)
    .doc(symbol)
    .set({ symbol, bars, lastSplit: null, updatedAt: Timestamp.now() })
  const metrics = providerMetrics(bars, last.date, week)
  if (metrics) await db.collection(COLLECTIONS.tickers).doc(symbol).update({ metrics })

  const stats = weeklyStats(bars, week)
  const weekRef = db.collection(COLLECTIONS.weeks).doc(week.start)
  if (!stats || !(await weekRef.get()).exists) return { bars: bars.length, addedToWeek: null }
  const { pfcp, high, low, close, range, svi } = stats
  // A FieldPath, so a symbol with a dot (BRK.B) stays one key.
  await weekRef.update(new FieldPath("rows", symbol), { pfcp, high, low, close, range, svi })
  return { bars: bars.length, addedToWeek: week.start }
}
