/**
 * Market data upkeep, shared by the Cloud Functions, the admins' "Update now" and scripts: every
 * session's bars, the tickers' high/low windows, Key Market Data for each completed week, and HG's weekly
 * close of the indexes. Each run brings everything up to date as of the last closed session, so a day
 * the job was skipped (or the key was missing) is filled in by the next run.
 */
import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore"
import { mapLimit } from "@/core/async"
import { mergeBars } from "@/core/calc/bars"
import { weeklyStats } from "@/core/calc/kmd"
import { tickerMetrics } from "@/core/calc/medians"
import { addDays, lastClosedSession, lastCompletedWeek, todayInMarketZone } from "@/core/dates"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { formatDate, formatShortDate } from "@/core/format"
import { lastCompleteWeek, tradingDayOnOrBefore, tradingDaysAfter } from "@/core/holidays"
import { INDEX_PROVIDER_TICKERS, INDEX_SYMBOLS, indexWeeklyStats } from "@/core/indices"
import { trackSpikes } from "../spikes"
import {
  COLLECTIONS,
  indexWeekRowSchema,
  parseDoc,
  tickerBarsSchema,
  tickerSchema,
  weekSchema,
  type Ticker,
} from "../model"
import {
  MarketDataError,
  fetchDailyRange,
  fetchGroupedDaily,
  fetchIntradayBars,
  fetchSplits,
  type MarketDataConfig,
} from "./provider"

/** Calendar days of history fetched for a ticker without any: about 400 sessions. */
const HISTORY_DAYS = 600
/** Missed sessions fetched one grouped request each; a longer gap fetches each ticker's history. */
const MAX_GROUPED_SESSIONS = 30
/** Completed weeks built in one run, newest last. */
const MAX_WEEKS = 12

type TickerRecord = Ticker & { id: string }

async function activeTickers(db: Firestore): Promise<TickerRecord[]> {
  const snap = await db.collection(COLLECTIONS.tickers).where("active", "==", true).get()
  return snap.docs
    .map((d) => parseDoc(tickerSchema, d.id, d.data()))
    .filter((t): t is TickerRecord => t !== null && t.kind !== "index")
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

const weekRow = (bars: readonly DailyBar[], week: { start: IsoDate; end: IsoDate }) => {
  const stats = weeklyStats(bars, week)
  if (!stats) return null
  const { pfcp, high, low, close, range, svi } = stats
  return { pfcp, high, low, close, range, svi }
}

export interface SyncResult {
  /** The last closed session the data now reaches. */
  through: IsoDate
  /** Missed sessions filled in from the provider's daily summaries. */
  sessions: IsoDate[]
  /** Tickers without history of their own that got about 18 months of it. */
  backfilled: string[]
  /** Tickers the provider has no bar for on `through` (a wrong or delisted symbol). */
  missing: string[]
  /** Tickers whose history was fetched again after a split. */
  resplit: string[]
  /** Key Market Data weeks written (their Mondays). */
  weeks: IsoDate[]
  /** Weeks whose index close was written. */
  indexWeeks: IsoDate[]
  /** Why the indexes were left as they were, when they were (for example a plan without index data). */
  indexNote: string | null
  /** Spikes whose stock traded back to the spike price in the new sessions. */
  spikesReached: number
}

/**
 * The completed weeks to write: those after the newest completed week on file, through the last complete
 * week (at most MAX_WEEKS), and the last complete week again unless it came from HG's sheet, so a late
 * bar still lands in it. With nothing on file, only the last complete week.
 */
async function weeksToBuild(db: Firestore, through: IsoDate): Promise<{ start: IsoDate; end: IsoDate }[]> {
  const latest = lastCompleteWeek(through)
  // A week still under way (its index values typed in early, say) does not count as on file.
  const newest = (
    await db
      .collection(COLLECTIONS.weeks)
      .where("weekStart", "<=", latest.start)
      .orderBy("weekStart", "desc")
      .limit(1)
      .get()
  ).docs[0]
  const onFile = newest ? parseDoc(weekSchema, newest.id, newest.data()) : null
  if (!onFile) return [latest]
  const weeks: { start: IsoDate; end: IsoDate }[] = []
  if (onFile.weekStart === latest.start && onFile.source !== "import") weeks.push(latest)
  for (let start = addDays(onFile.weekStart, 7); start <= latest.start; start = addDays(start, 7))
    weeks.push({ start, end: addDays(start, 4) })
  return weeks.slice(-MAX_WEEKS)
}

/**
 * HG's weekly close of the Dow, the S&P 500 and the Nasdaq for each week, with when each high and low
 * happened (from 5-minute bars). Values an admin typed in stay. Returns the weeks written, or why none.
 */
async function writeIndexWeeks(
  db: Firestore,
  config: MarketDataConfig,
  weeks: readonly { start: IsoDate; end: IsoDate }[],
  fetchImpl: typeof fetch | undefined,
): Promise<{ written: IsoDate[]; note: string | null }> {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (!first || !last) return { written: [], note: null }
  const written = new Set<IsoDate>()
  try {
    for (const symbol of INDEX_SYMBOLS) {
      const ticker = INDEX_PROVIDER_TICKERS[symbol]
      const [daily, intraday] = await Promise.all([
        fetchDailyRange(config, ticker, addDays(first.start, -10), last.end, fetchImpl),
        fetchIntradayBars(config, ticker, 5, first.start, last.end, fetchImpl),
      ])
      for (const week of weeks) {
        const stats = indexWeeklyStats(daily, intraday, week)
        if (!stats) continue
        const ref = db.collection(COLLECTIONS.weeks).doc(week.start)
        const saved = (await ref.get()).get(new FieldPath("indices", symbol)) as unknown
        if (saved && indexWeekRowSchema.safeParse(saved).data?.entered) continue
        const { pfcp, high, low, close, range, svi, highAt, lowAt } = stats
        await ref.set(
          {
            weekStart: week.start,
            weekEnd: week.end,
            indices: { [symbol]: { pfcp, high, low, close, range, svi, highAt, lowAt, entered: false } },
          },
          { merge: true },
        )
        written.add(week.start)
      }
    }
  } catch (error) {
    // Index data is a separate plan; without it the indexes stay as typed in under Market data.
    if (error instanceof MarketDataError && (error.status === 401 || error.status === 403))
      return { written: [...written], note: "Index data is not included in the market data plan" }
    throw error
  }
  return { written: [...written].sort(), note: null }
}

/**
 * Brings the market data up to date as of the last closed session: whole histories for tickers that have
 * none, every session missed since the last run, histories again after a split, each ticker's high/low
 * windows, then Key Market Data and the index close for every completed week not yet on file. Safe to
 * run any number of times.
 */
export async function syncMarket(
  db: Firestore,
  config: MarketDataConfig,
  now: Date = new Date(),
  fetchImpl?: typeof fetch,
): Promise<SyncResult> {
  const today = todayInMarketZone(now)
  const through = tradingDayOnOrBefore(lastClosedSession(now))
  const tickers = await activeTickers(db)
  const stored = await readBars(
    db,
    tickers.map((t) => t.symbol),
  )
  const changed = new Set<string>()
  const lastBar = (symbol: string) => stored.get(symbol)?.bars.at(-1)?.date ?? null

  // Tickers with no history of their own (imported from the sheets, or added while the key was off).
  const fresh = tickers.filter((t) => lastBar(t.symbol) === null)
  const backfilled: string[] = []
  await mapLimit(fresh, 4, async (t) => {
    const bars = mergeBars(
      [],
      await fetchDailyRange(config, t.symbol, addDays(through, -HISTORY_DAYS), through, fetchImpl),
    )
    if (bars.length === 0) return
    stored.set(t.symbol, { bars, lastSplit: null })
    changed.add(t.symbol)
    backfilled.push(t.symbol)
  })

  // The sessions since the ticker furthest behind.
  const behind = tickers
    .map((t) => lastBar(t.symbol))
    .filter((date): date is IsoDate => date !== null && date < through)
    .sort()[0]
  const sessions = behind ? tradingDaysAfter(behind, through) : []
  if (sessions.length > MAX_GROUPED_SESSIONS) {
    await mapLimit(
      tickers.filter((t) => (lastBar(t.symbol) ?? through) < through),
      4,
      async (t) => {
        const since = lastBar(t.symbol) ?? through
        const recent = await fetchDailyRange(config, t.symbol, addDays(since, 1), through, fetchImpl)
        const entry = stored.get(t.symbol)
        if (!entry || recent.length === 0) return
        stored.set(t.symbol, { ...entry, bars: mergeBars(entry.bars, recent) })
        changed.add(t.symbol)
      },
    )
  } else {
    for (const session of sessions) {
      const bars = await fetchGroupedDaily(config, session, fetchImpl)
      for (const t of tickers) {
        const bar = bars.get(t.symbol)
        const entry = stored.get(t.symbol)
        if (!bar || !entry || (lastBar(t.symbol) ?? "") >= session) continue
        stored.set(t.symbol, { ...entry, bars: mergeBars(entry.bars, [bar]) })
        changed.add(t.symbol)
      }
    }
  }

  // A split not yet in a ticker's bars: its whole split-adjusted history again, so the weeks around it
  // never mix old and new share prices.
  const splits = await fetchSplits(config, addDays(sessions[0] ?? through, -7), through, fetchImpl)
  const resplit = new Map<string, IsoDate>()
  for (const s of splits) {
    const entry = stored.get(s.symbol)
    if (!entry || s.executionDate > through || backfilled.includes(s.symbol)) continue
    if (entry.lastSplit !== null && entry.lastSplit >= s.executionDate) continue
    if ((resplit.get(s.symbol) ?? "") < s.executionDate) resplit.set(s.symbol, s.executionDate)
  }
  await mapLimit([...resplit], 4, async ([symbol, executionDate]) => {
    const bars = mergeBars(
      [],
      await fetchDailyRange(config, symbol, addDays(through, -HISTORY_DAYS), through, fetchImpl),
    )
    if (bars.length === 0) return
    stored.set(symbol, { bars, lastSplit: executionDate })
    changed.add(symbol)
  })

  // The bars that changed, and every ticker's windows (the 5-day one rolls over on the weekend).
  const metricsWeek = lastCompletedWeek(today)
  const writer = db.bulkWriter()
  for (const t of tickers) {
    const entry = stored.get(t.symbol)
    const last = entry?.bars.at(-1)
    if (!entry || !last) continue
    if (changed.has(t.symbol))
      void writer.set(db.collection(COLLECTIONS.tickerBars).doc(t.symbol), {
        symbol: t.symbol,
        bars: entry.bars,
        lastSplit: entry.lastSplit,
        updatedAt: Timestamp.now(),
      })
    const metrics = providerMetrics(entry.bars, last.date, metricsWeek)
    if (metrics) void writer.update(db.collection(COLLECTIONS.tickers).doc(t.symbol), { metrics })
  }
  await writer.close()

  // Key Market Data: HG's sheet lists stocks, so the ETFs (kept for the Leveraged ETF guide) stay out.
  const weeks = await weeksToBuild(db, through)
  const written: IsoDate[] = []
  for (const week of weeks) {
    const rows: Record<string, NonNullable<ReturnType<typeof weekRow>>> = {}
    for (const t of tickers) {
      const bars = stored.get(t.symbol)?.bars
      const row = t.kind === "stock" && bars ? weekRow(bars, week) : null
      if (row) rows[t.symbol] = row
    }
    if (Object.keys(rows).length === 0) continue
    await db
      .collection(COLLECTIONS.weeks)
      .doc(week.start)
      .set(
        { weekStart: week.start, weekEnd: week.end, rows, source: "provider", computedAt: Timestamp.now() },
        { mergeFields: ["weekStart", "weekEnd", "rows", "source", "computedAt"] },
      )
    written.push(week.start)
  }
  const indexes = await writeIndexWeeks(
    db,
    config,
    weeks.filter((w) => written.includes(w.start)),
    fetchImpl,
  )
  const spikesReached = await trackSpikes(db)

  return {
    through,
    sessions,
    backfilled: backfilled.sort(),
    missing: tickers.filter((t) => (lastBar(t.symbol) ?? "") < through).map((t) => t.symbol),
    resplit: [...resplit.keys()].sort(),
    weeks: written,
    indexWeeks: indexes.written,
    indexNote: indexes.note,
    spikesReached,
  }
}

/** A list for people: "Oct 5, Oct 12 and Oct 19". */
const list = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`

/** What a sync did, in a sentence or two for the Market data page and the job runs list. */
export function describeSync(result: SyncResult): string {
  const parts = [`Up to date through the ${formatDate(result.through)} close`]
  if (result.sessions.length > 0)
    parts.push(`${result.sessions.length === 1 ? "1 session" : `${String(result.sessions.length)} sessions`} filled in`)
  if (result.backfilled.length > 0) parts.push(`price history for ${list(result.backfilled.slice(0, 8))}`)
  if (result.weeks.length > 0)
    parts.push(
      `Key Market Data for the week${result.weeks.length === 1 ? "" : "s"} of ${list(result.weeks.map(formatShortDate))}`,
    )
  if (result.indexNote) parts.push(result.indexNote)
  if (result.spikesReached > 0)
    parts.push(
      `${result.spikesReached === 1 ? "1 spike" : `${String(result.spikesReached)} spikes`} traded back to the spike price`,
    )
  if (result.resplit.length > 0) parts.push(`history fetched again after a split: ${list(result.resplit)}`)
  if (result.missing.length > 0) parts.push(`no prices for ${list(result.missing.slice(0, 12))}`)
  return `${parts.join(". ")}.`
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
  const week = lastCompleteWeek(tradingDayOnOrBefore(lastSession))
  await db
    .collection(COLLECTIONS.tickerBars)
    .doc(symbol)
    .set({ symbol, bars, lastSplit: null, updatedAt: Timestamp.now() })
  const metrics = providerMetrics(bars, last.date, lastCompletedWeek(addDays(lastSession, 1)))
  if (metrics) await db.collection(COLLECTIONS.tickers).doc(symbol).update({ metrics })

  const row = weekRow(bars, week)
  const weekRef = db.collection(COLLECTIONS.weeks).doc(week.start)
  if (!row || !(await weekRef.get()).exists) return { bars: bars.length, addedToWeek: null }
  // A FieldPath, so a symbol with a dot (BRK.B) stays one key.
  await weekRef.update(new FieldPath("rows", symbol), row)
  return { bars: bars.length, addedToWeek: week.start }
}

/** config/marketSync: an admin's "Update now", picked up by a Cloud Function (or the web server locally). */
export const MARKET_SYNC_DOC = "marketSync"

/**
 * Runs the sync an admin asked for, once however many times the trigger fires: the run that claims the
 * pending request does it, and records how it went on the request for the Market data page.
 */
export async function runRequestedSync(
  db: Firestore,
  config: MarketDataConfig | null,
  claimId: string,
  fetchImpl?: typeof fetch,
): Promise<SyncResult | null> {
  const ref = db.collection(COLLECTIONS.config).doc(MARKET_SYNC_DOC)
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.get("status") !== "pending") return false
    tx.update(ref, { status: "running", claimId, startedAt: Timestamp.now() })
    return true
  })
  if (!claimed) return null
  if (!config) {
    await ref.update({
      status: "failed",
      message: "No market data provider is connected.",
      finishedAt: Timestamp.now(),
    })
    return null
  }
  try {
    const result = await syncMarket(db, config, new Date(), fetchImpl)
    await ref.update({ status: "done", message: describeSync(result), finishedAt: Timestamp.now() })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await ref.update({ status: "failed", message: message.slice(0, 500), finishedAt: Timestamp.now() })
    throw error
  }
}
