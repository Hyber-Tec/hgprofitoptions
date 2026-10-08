/**
 * Demo data for the local emulators only: members in every membership state, HG's alerts,
 * journals and linked portfolios, HG's house account, presentations and files.
 *
 *   pnpm seed:demo                       # random passwords, printed at the end
 *   pnpm seed:demo --password=<value>    # one password for every demo login (used by E2E tests)
 *
 * When the private source files were not imported, a small synthetic market data set is created
 * so every tool page still has data. Demo documents use ids starting with "demo-" and are
 * replaced on every run.
 */
import { randomBytes } from "node:crypto"
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { Auth } from "firebase-admin/auth"
import { defaultAlertTitle, type AlertFields } from "../src/core/alerts"
import { signedRange, svi } from "../src/core/calc/kmd"
import { alertReturn } from "../src/core/calc/standing"
import { buildTrades, instrumentKey } from "../src/core/calc/trades"
import {
  addDays,
  isoDateInZone,
  isWeekend,
  lastCompletedWeek,
  nextFriday,
  todayInMarketZone,
  zonedStartOfDay,
} from "../src/core/dates"
import type { DailyBar, Fill, Instrument, IsoDate, Quarter } from "../src/core/domain/types"
import { addQuarters, periodFromQuarters, quarterOf, quarterRange } from "../src/core/membership/quarters"
import { CONSENT_VERSION } from "../src/server/brokerage/sync"
import { recomputeAccess } from "../src/server/members"
import {
  ACCOUNT_SUBCOLLECTIONS,
  COLLECTIONS,
  DEFAULT_PREFS,
  MEMBER_SUBCOLLECTIONS,
  memberSettingsSchema,
  parseDoc,
  tickerSchema,
  type Ticker,
} from "../src/server/model"
import { computeMemberStats } from "../src/server/portfolio"
import { computeStanding } from "../src/server/standing"
import { flag, initAdmin, option } from "./lib/admin"

// ---------------------------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261007)
const between = (min: number, max: number) => min + rand() * (max - min)
const normal = (mean: number, sd: number) =>
  mean + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
const pick = <T>(items: readonly T[]): T => {
  const item = items[Math.floor(rand() * items.length)]
  if (item === undefined) throw new Error("pick from an empty list")
  return item
}
const round2 = (n: number) => Math.round(n * 100) / 100
const roundStrike = (price: number) =>
  price < 25 ? Math.round(price) : price < 200 ? Math.round(price / 2.5) * 2.5 : Math.round(price / 5) * 5

/** An instant on a market day in New York, e.g. at(day, 9, 42). */
const at = (day: IsoDate, hours: number, minutes = 0) =>
  new Date(zonedStartOfDay(day).getTime() + (hours * 60 + minutes) * 60_000)
const ts = (date: Date) => Timestamp.fromDate(date)

function tradingDaysBack(end: IsoDate, count: number): IsoDate[] {
  const days: IsoDate[] = []
  for (let d = end; days.length < count; d = addDays(d, -1)) if (!isWeekend(d)) days.unshift(d)
  return days
}

// ---------------------------------------------------------------------------------------------
// Market data (synthetic only when nothing was imported)
// ---------------------------------------------------------------------------------------------

const SAMPLE_TICKERS: [string, number, number][] = [
  ["AAPL", 256.4, 6.5],
  ["MSFT", 521.8, 10],
  ["NVDA", 186.2, 5],
  ["TSM", 301.5, 7.5],
  ["PLTR", 182.3, 5],
  ["LLY", 822.6, 20],
  ["META", 718.9, 15],
  ["AMD", 164.7, 5],
  ["TSLA", 431.2, 12.5],
  ["ORCL", 288.4, 7.5],
  ["LMT", 482.1, 10],
  ["GE", 298.6, 7.5],
]

function randomBars(lastClose: number, end: IsoDate, count: number): DailyBar[] {
  const days = tradingDaysBack(end, count)
  const closes: number[] = [lastClose]
  for (let i = 1; i < days.length; i++) closes.unshift((closes[0] ?? lastClose) / (1 + normal(0.0006, 0.018)))
  return days.map((date, i) => {
    const close = round2(closes[i] ?? lastClose)
    const open = round2(close * (1 + normal(0, 0.006)))
    const high = round2(Math.max(open, close) * (1 + Math.abs(normal(0, 0.009))))
    const low = round2(Math.min(open, close) * (1 - Math.abs(normal(0, 0.009))))
    return { date, open, high, low, close, volume: Math.round(between(2e6, 4e7)) }
  })
}

function windowHighLow(bars: readonly DailyBar[], from: IsoDate, to: IsoDate) {
  const inside = bars.filter((b) => b.date >= from && b.date <= to)
  if (inside.length === 0) return { high: null, low: null }
  return { high: Math.max(...inside.map((b) => b.high)), low: Math.min(...inside.map((b) => b.low)) }
}

async function ensureMarketData(db: Firestore, today: IsoDate): Promise<Ticker[]> {
  const existing = await db.collection(COLLECTIONS.tickers).get()
  const parsed = existing.docs
    .map((d) => parseDoc(tickerSchema, d.id, d.data()))
    .filter((t): t is Ticker & { id: string } => t !== null)
  if (parsed.some((t) => t.metrics !== null)) {
    console.log(`Using ${parsed.length} imported tickers`)
    return parsed
  }

  console.log("No imported market data found: writing a synthetic sample")
  const asOf = addDays(today, -1)
  const week = lastCompletedWeek(today)
  const tickers: Ticker[] = []
  const weekRows: Record<string, ReturnType<typeof weekRow>> = {}
  function weekRow(bars: readonly DailyBar[]) {
    const inWeek = bars.filter((b) => b.date >= week.start && b.date <= week.end)
    const before = bars.filter((b) => b.date < week.start).at(-1)
    const last = inWeek.at(-1)
    if (!before || !last) return null
    const high = Math.max(...inWeek.map((b) => b.high))
    const low = Math.min(...inWeek.map((b) => b.low))
    const range = signedRange(before.close, high, low, last.close)
    return { pfcp: before.close, high, low, close: last.close, range, svi: svi(range, last.close) }
  }
  const writer = db.bulkWriter()
  for (const [symbol, lastClose, ch] of SAMPLE_TICKERS) {
    const bars = randomBars(lastClose, asOf, 260)
    const w5 = windowHighLow(bars, week.start, week.end)
    const w30 = windowHighLow(bars, addDays(asOf, -29), asOf)
    const w90 = windowHighLow(bars, addDays(asOf, -89), asOf)
    const close = bars.at(-1)?.close ?? lastClose
    const ticker: Ticker = {
      symbol,
      name: null,
      kind: "stock",
      active: true,
      channelSize: ch,
      bocSize: ch / 2,
      fsLevels: [roundStrike(close * 0.9)],
      ssLevels: [roundStrike(close * 1.1)],
      earningsStart: symbol === "TSM" || symbol === "TSLA" ? addDays(today, 9) : null,
      earningsEnd: symbol === "TSM" || symbol === "TSLA" ? addDays(today, 11) : null,
      earningsNote: null,
      notes: null,
      categories: [],
      metrics: {
        asOf,
        lastClose: close,
        price: close,
        high5d: w5.high,
        low5d: w5.low,
        high30d: w30.high,
        low30d: w30.low,
        high90d: w90.high,
        low90d: w90.low,
        source: "manual",
      },
      updatedAt: new Date(),
      updatedBy: null,
    }
    tickers.push(ticker)
    void writer.set(db.collection(COLLECTIONS.tickers).doc(symbol), { ...ticker, updatedAt: Timestamp.now() })
    void writer.set(db.collection(COLLECTIONS.tickerBars).doc(symbol), { symbol, bars, updatedAt: Timestamp.now() })
    const row = weekRow(bars)
    if (row) weekRows[symbol] = row
  }
  const indexRow = (level: number) => {
    const pfcp = level * (1 + normal(0, 0.01))
    const close = level
    const high = Math.max(pfcp, close) * 1.008
    const low = Math.min(pfcp, close) * 0.992
    const range = signedRange(pfcp, high, low, close)
    return { pfcp: round2(pfcp), high: round2(high), low: round2(low), close, range, svi: svi(range, close) }
  }
  void writer.set(db.collection(COLLECTIONS.weeks).doc(week.start), {
    weekStart: week.start,
    weekEnd: week.end,
    rows: weekRows,
    indices: { DJI: indexRow(46758.3), SPX: indexRow(6715.8), IXIC: indexRow(22780.5) },
    source: "manual",
    computedAt: Timestamp.now(),
  })

  const groups = [
    {
      slug: "small-channel",
      name: "Small Channel",
      shortName: "Small Channel",
      description: null,
      order: 1,
      aliases: [],
    },
    {
      slug: "large-channel",
      name: "Large Channel",
      shortName: "Large Channel",
      description: null,
      order: 2,
      aliases: [],
    },
    { slug: "strategic", name: "Strategic", shortName: "Strategic", description: null, order: 3, aliases: [] },
    { slug: "future", name: "Future", shortName: "Future", description: null, order: 4, aliases: [] },
  ]
  void writer.set(db.collection(COLLECTIONS.config).doc("targetGroups"), { groups })
  const effectiveDate = today
  const entries = tickers.map((t, i) => {
    const close = t.metrics?.lastClose ?? 100
    const ch = t.channelSize ?? 5
    return {
      group: groups[i % groups.length]?.slug ?? "strategic",
      position: Math.floor(i / groups.length) + 1,
      symbol: t.symbol,
      target: roundStrike(close + ch * 0.5),
      breakLevel: roundStrike(close - ch * 0.5),
      putStrike: roundStrike(close - ch),
      expiry: nextFriday(addDays(effectiveDate, 7)),
      dowWeight: null,
      note: null,
    }
  })
  void writer.set(db.collection(COLLECTIONS.targetUpdates).doc(effectiveDate), {
    effectiveDate,
    title: "Strike Price Targets Update (demo)",
    status: "published",
    entries,
    sourceText: null,
    changeNote: null,
    revisionOf: null,
    revision: 1,
    publishedAt: Timestamp.now(),
    publishedBy: null,
    createdAt: Timestamp.now(),
    createdBy: null,
  })
  void writer.set(db.collection(COLLECTIONS.config).doc("leveragedEtfs"), {
    guidance: [
      "Leveraged ETFs move about twice as much as the stock, in both directions. Book a one-on-one with HG before trading them.",
      "If you are not yet comfortable with options, stay with the class guidance on profit options, strategic stocks and future stocks.",
    ],
    pairs: [
      { underlying: "NVDA", etf: "NVDL", leverage: 2, direction: "bull", issuer: null },
      { underlying: "TSLA", etf: "TSLL", leverage: 2, direction: "bull", issuer: null },
      { underlying: "PLTR", etf: "PLTU", leverage: 2, direction: "bull", issuer: null },
      { underlying: "AMD", etf: "AMDL", leverage: 2, direction: "bull", issuer: null },
    ],
    updatedAt: Timestamp.now(),
  })
  await writer.close()
  return tickers
}

async function ensureBars(db: Firestore, tickers: readonly Ticker[]): Promise<void> {
  const writer = db.bulkWriter()
  let written = 0
  for (const t of tickers) {
    if (t.kind !== "stock" || !t.metrics) continue
    const existing = await db.collection(COLLECTIONS.tickerBars).doc(t.symbol).get()
    if (existing.exists) continue
    void writer.set(db.collection(COLLECTIONS.tickerBars).doc(t.symbol), {
      symbol: t.symbol,
      bars: randomBars(t.metrics.lastClose, t.metrics.asOf, 260),
      updatedAt: Timestamp.now(),
    })
    written++
  }
  await writer.close()
  if (written > 0)
    console.log(`Demo daily bars for ${written} tickers (replaced by real data once market data is connected)`)
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

interface DemoMember {
  key: string
  email: string
  fullName: string
  role: "admin" | "member"
  status?: "active" | "suspended"
  /** [year, quarter, count, customStart?] */
  periods: [number, Quarter, number, IsoDate?][]
  linked: boolean
  manualTrades?: boolean
  location: string
  timezone: string
  phone?: string
  skill: number
}

/** Quarters relative to the one containing today, so the demo (and the E2E tests) never go stale. */
const CURRENT = quarterOf(todayInMarketZone())
function q(offset: number): [number, Quarter] {
  const r = addQuarters(CURRENT.year, CURRENT.q, offset)
  return [r.year, r.q]
}
/** A late start inside the current quarter (a member who joined mid-quarter). */
function lateStart(): IsoDate {
  const start = addDays(quarterRange(CURRENT.year, CURRENT.q).start, 4)
  const today = todayInMarketZone()
  return start > today ? today : start
}

const MEMBERS: DemoMember[] = [
  {
    key: "hg",
    email: "hg.demo@example.com",
    fullName: "Hubert Gaffney",
    role: "admin",
    periods: [],
    linked: true,
    location: "Kentucky",
    timezone: "America/New_York",
    skill: 0.9,
  },
  {
    key: "ava",
    email: "ava.martin@example.com",
    fullName: "Ava Martin",
    role: "member",
    periods: [[...q(-3), 4]],
    linked: true,
    location: "Austin, Texas",
    timezone: "America/Chicago",
    phone: "+1 512 555 0142",
    skill: 0.62,
  },
  {
    key: "ben",
    email: "ben.carter@example.com",
    fullName: "Ben Carter",
    role: "member",
    periods: [
      [...q(-1), 1],
      [...q(0), 1],
    ],
    linked: true,
    location: "Atlanta, Georgia",
    timezone: "America/New_York",
    skill: 0.48,
  },
  {
    key: "chloe",
    email: "chloe.nguyen@example.com",
    fullName: "Chloe Nguyen",
    role: "member",
    periods: [[...q(1), 1]],
    linked: false,
    location: "San Jose, California",
    timezone: "America/Los_Angeles",
    skill: 0.5,
  },
  {
    key: "diego",
    email: "diego.ramos@example.com",
    fullName: "Diego Ramos",
    role: "member",
    periods: [[...q(-2), 2]],
    linked: true,
    location: "Miami, Florida",
    timezone: "America/New_York",
    skill: 0.4,
  },
  {
    key: "emma",
    email: "emma.wilson@example.com",
    fullName: "Emma Wilson",
    role: "member",
    status: "suspended",
    periods: [[...q(0), 1]],
    linked: false,
    location: "Denver, Colorado",
    timezone: "America/Denver",
    skill: 0.5,
  },
  {
    key: "farah",
    email: "farah.haddad@example.com",
    fullName: "Farah Haddad",
    role: "member",
    periods: [[...q(0), 1, lateStart()]],
    linked: true,
    location: "London, UK",
    timezone: "Europe/London",
    skill: 0.55,
  },
  {
    key: "george",
    email: "george.okafor@example.com",
    fullName: "George Okafor",
    role: "member",
    periods: [[...q(-1), 2]],
    linked: true,
    location: "Kigali, Rwanda",
    timezone: "Africa/Kigali",
    skill: 0.66,
  },
  {
    key: "hana",
    email: "hana.sato@example.com",
    fullName: "Hana Sato",
    role: "member",
    periods: [[...q(0), 1]],
    linked: true,
    location: "Osaka, Japan",
    timezone: "Asia/Tokyo",
    skill: 0.44,
  },
  {
    key: "ivan",
    email: "ivan.petrov@example.com",
    fullName: "Ivan Petrov",
    role: "member",
    periods: [[...q(0), 2]],
    linked: true,
    location: "Sofia, Bulgaria",
    timezone: "Europe/Sofia",
    skill: 0.58,
  },
  {
    key: "julia",
    email: "julia.brooks@example.com",
    fullName: "Julia Brooks",
    role: "member",
    periods: [[...q(0), 1]],
    linked: false,
    manualTrades: true,
    location: "Toronto, Canada",
    timezone: "America/Toronto",
    skill: 0.52,
  },
]

const uidOf = (key: string) => `demo-${key}`

type Bucket = ReturnType<typeof initAdmin>["bucket"]

async function resetDemo(db: Firestore, auth: Auth, bucket: Bucket): Promise<void> {
  for (const m of MEMBERS) {
    await auth.deleteUser(uidOf(m.key)).catch(() => undefined)
    await db.recursiveDelete(db.collection(COLLECTIONS.members).doc(uidOf(m.key)))
    await db.collection(COLLECTIONS.invites).doc(m.email).delete()
  }
  for (const name of [COLLECTIONS.alerts, COLLECTIONS.presentations, COLLECTIONS.resources]) {
    const snap = await db.collection(name).get()
    for (const doc of snap.docs) if (doc.id.startsWith("demo-")) await db.recursiveDelete(doc.ref)
  }
  await db.collection(COLLECTIONS.invites).doc("new.member@example.com").delete()
  await bucket.deleteFiles({ prefix: "content/demo/" }).catch(() => undefined)
}

// ---------------------------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------------------------

interface DemoAlert extends AlertFields {
  id: string
  title: string
  body: string
  parentId: string | null
  status: "draft" | "scheduled" | "published" | "closed"
  publishedAt: Date | null
  publishAt: Date | null
  closedAt: Date | null
  exits: { price: number; portion: number; at: Date }[]
}

function optionAlert(
  id: string,
  ticker: Ticker,
  day: IsoDate,
  premium: number,
  outcome: number[] | null,
  today: IsoDate,
): DemoAlert[] {
  const close = ticker.metrics?.lastClose ?? 100
  const strike = roundStrike(close + (ticker.channelSize ?? 5) * 0.5)
  const fields: AlertFields = {
    kind: "buy",
    symbol: ticker.symbol,
    assetType: "option",
    optionRight: "call",
    strike,
    expiry: nextFriday(addDays(day, 10)),
    buyLow: round2(premium * 0.97),
    buyHigh: round2(premium * 1.03),
    sellPoints: [round2(premium * 1.5), round2(premium * 1.9)],
    stop: round2(premium * 0.7),
  }
  const publishedAt = at(day, 9, 42 + Math.floor(rand() * 15))
  const root: DemoAlert = {
    ...fields,
    id,
    title: defaultAlertTitle(fields),
    body: `${ticker.symbol} is holding the channel line. Entry on a pullback into the buy point; first target at the next line up.`,
    parentId: null,
    status: "published",
    publishedAt,
    publishAt: null,
    closedAt: null,
    exits: [],
  }
  if (!outcome) return [root]
  const followUps: DemoAlert[] = []
  let exitDay = day
  outcome.forEach((multiple, i) => {
    exitDay = addDays(exitDay, 1 + Math.floor(rand() * 3))
    if (exitDay >= today) exitDay = addDays(today, -1)
    const price = round2(premium * multiple)
    const portion = outcome.length === 1 ? 1 : 0.5
    const when = at(exitDay, 11, 5 + i * 7)
    root.exits.push({ price, portion, at: when })
    const sellFields: AlertFields = {
      ...fields,
      kind: "sell",
      buyLow: null,
      buyHigh: null,
      sellPoints: [price],
      stop: null,
    }
    followUps.push({
      ...sellFields,
      id: `${id}-f${i + 1}`,
      title: root.title,
      body:
        multiple >= 1
          ? outcome.length > 1 && i === 0
            ? `Sold half at T1 ${price.toFixed(2)}. Moving the stop to break-even.`
            : `Closed the rest at ${price.toFixed(2)}.`
          : `Stopped out at ${price.toFixed(2)}. Protect the capital and wait for the next setup.`,
      parentId: id,
      status: "published",
      publishedAt: when,
      publishAt: null,
      closedAt: null,
      exits: [],
    })
  })
  root.status = "closed"
  root.closedAt = root.exits.at(-1)?.at ?? null
  return [root, ...followUps]
}

function alertDoc(a: DemoAlert, adminUid: string) {
  const result =
    a.status === "closed" && a.buyLow !== null && a.buyHigh !== null ? alertReturn(a.buyLow, a.buyHigh, a.exits) : null
  const delivered = a.status === "published" || a.status === "closed" ? 9 : 0
  return {
    kind: a.kind,
    symbol: a.symbol,
    assetType: a.assetType,
    optionRight: a.optionRight,
    strike: a.strike,
    expiry: a.expiry,
    buyLow: a.buyLow,
    buyHigh: a.buyHigh,
    sellPoints: a.sellPoints,
    stop: a.stop,
    title: a.title,
    body: a.body,
    imagePath: null,
    parentId: a.parentId,
    targetEntrySymbol: a.kind === "buy" ? a.symbol : null,
    status: a.status,
    publishAt: a.publishAt ? ts(a.publishAt) : null,
    publishedAt: a.publishedAt ? ts(a.publishedAt) : null,
    closedAt: a.closedAt ? ts(a.closedAt) : null,
    exits: a.exits.map((e) => ({ price: e.price, portion: e.portion, at: ts(e.at) })),
    resultPct: result === null ? null : Math.round(result * 10000) / 10000,
    sendEmail: false,
    delivery:
      delivered > 0
        ? {
            audience: 8,
            queued: delivered,
            sent: delivered - 1,
            failed: 1,
            finishedAt: a.publishedAt ? ts(new Date(a.publishedAt.getTime() + 4000)) : null,
          }
        : null,
    edited: false,
    editedAt: null,
    revision: 1,
    createdBy: adminUid,
    createdAt: ts(a.publishedAt ?? new Date()),
  }
}

// ---------------------------------------------------------------------------------------------
// Trades, accounts and snapshots
// ---------------------------------------------------------------------------------------------

const SETUPS = ["Channel break", "BOC bounce", "Median reclaim", "Earnings play", "Other"]
const TAGS = ["swing", "scalp", "earnings", "trend", "patience", "fomo"]
const EMOTIONS = ["Calm", "Confident", "Anxious", "Impatient", "Greedy", "Disciplined"]

function demoFills(
  m: DemoMember,
  accountId: string,
  tickers: readonly Ticker[],
  alerts: readonly DemoAlert[],
  today: IsoDate,
): { fills: Fill[]; alertByKey: Map<string, string> } {
  const fills: Fill[] = []
  const alertByKey = new Map<string, string>()
  let n = 0
  const add = (instrument: Instrument, side: "buy" | "sell", quantity: number, price: number, when: Date) => {
    fills.push({
      id: `${m.key}-f${++n}`,
      accountId,
      instrument,
      side,
      quantity,
      price: round2(Math.max(0.01, price)),
      fees: instrument.assetType === "option" ? round2(0.65 * quantity) : 0,
      executedAt: when.toISOString(),
    })
  }

  // Trades that followed HG's alerts.
  for (const alert of alerts) {
    if (
      alert.parentId !== null ||
      alert.kind !== "buy" ||
      alert.assetType !== "option" ||
      !alert.symbol ||
      alert.strike === null ||
      !alert.expiry ||
      alert.optionRight === null
    )
      continue
    if (rand() > (m.key === "hg" ? 1 : 0.55)) continue
    const instrument: Instrument = {
      assetType: "option",
      symbol: alert.symbol,
      right: alert.optionRight,
      strike: alert.strike,
      expiry: alert.expiry as IsoDate,
    }
    const qty = m.key === "hg" ? 10 : 1 + Math.floor(rand() * 4)
    const entry = (((alert.buyLow ?? 1) + (alert.buyHigh ?? 1)) / 2) * (1 + normal(0, 0.02))
    const opened = new Date((alert.publishedAt ?? new Date()).getTime() + Math.floor(between(3, 40)) * 60_000)
    add(instrument, "buy", qty, entry, opened)
    alertByKey.set(instrumentKey(instrument), alert.id)
    if (alert.exits.length > 0) {
      let left = qty
      alert.exits.forEach((exit, i) => {
        const q = i === alert.exits.length - 1 ? left : Math.max(1, Math.round(qty * exit.portion))
        if (q <= 0) return
        left -= q
        add(
          instrument,
          "sell",
          q,
          exit.price * (1 + normal(0, 0.03)),
          new Date(exit.at.getTime() + Math.floor(between(1, 25)) * 60_000),
        )
      })
    }
  }

  // The member's own ideas over the last ~100 days.
  const universe = tickers.filter((t) => t.kind === "stock" && t.metrics)
  const tradeCount = m.key === "hg" ? 14 : 12 + Math.floor(rand() * 20)
  for (let i = 0; i < tradeCount; i++) {
    const ticker = pick(universe)
    const close = ticker.metrics?.lastClose ?? 100
    let day = addDays(today, -Math.floor(between(2, 100)))
    while (isWeekend(day)) day = addDays(day, -1)
    const opened = at(day, 10 + Math.floor(rand() * 5), Math.floor(rand() * 60))
    const won = rand() < m.skill
    const isOption = rand() < 0.8
    const stillOpen = i >= tradeCount - 2
    if (isOption) {
      const instrument: Instrument = {
        assetType: "option",
        symbol: ticker.symbol,
        right: rand() < 0.85 ? "call" : "put",
        strike: roundStrike(close * between(0.97, 1.05)),
        expiry: nextFriday(addDays(day, Math.floor(between(5, 25)))),
      }
      const premium = between(1.2, 9)
      const qty = 1 + Math.floor(rand() * 5)
      add(instrument, "buy", qty, premium, opened)
      if (!stillOpen) {
        const move = won ? Math.abs(normal(0.32, 0.25)) + 0.05 : -Math.abs(normal(0.3, 0.15)) - 0.05
        const closeDay = addDays(day, 1 + Math.floor(rand() * 6))
        add(
          instrument,
          "sell",
          qty,
          premium * (1 + move),
          at(closeDay < today ? closeDay : addDays(today, -1), 14, Math.floor(rand() * 60)),
        )
      }
    } else {
      const instrument: Instrument = { assetType: "stock", symbol: ticker.symbol }
      const qty = 10 * (1 + Math.floor(rand() * 8))
      const price = close * between(0.9, 1.02)
      add(instrument, "buy", qty, price, opened)
      if (!stillOpen) {
        const move = won ? Math.abs(normal(0.03, 0.02)) + 0.005 : -Math.abs(normal(0.025, 0.015)) - 0.004
        const closeDay = addDays(day, 2 + Math.floor(rand() * 15))
        add(
          instrument,
          "sell",
          qty,
          price * (1 + move),
          at(closeDay < today ? closeDay : addDays(today, -1), 15, Math.floor(rand() * 50)),
        )
      }
    }
  }
  return { fills: fills.sort((a, b) => a.executedAt.localeCompare(b.executedAt)), alertByKey }
}

function instrumentFields(instrument: Instrument) {
  return instrument.assetType === "option"
    ? {
        symbol: instrument.symbol,
        assetType: "option" as const,
        optionRight: instrument.right,
        strike: instrument.strike,
        expiry: instrument.expiry,
      }
    : { symbol: instrument.symbol, assetType: "stock" as const, optionRight: null, strike: null, expiry: null }
}

async function seedTrades(
  db: Firestore,
  m: DemoMember,
  accountId: string | null,
  tickers: readonly Ticker[],
  alerts: readonly DemoAlert[],
  today: IsoDate,
) {
  const uid = uidOf(m.key)
  const { fills, alertByKey } = demoFills(m, accountId ?? "manual", tickers, alerts, today)
  const { closed, open } = buildTrades(fills)
  const fillById = new Map(fills.map((f) => [f.id, f]))
  const tradesRef = db.collection(COLLECTIONS.members).doc(uid).collection(MEMBER_SUBCOLLECTIONS.trades)
  const writer = db.bulkWriter()
  const source = m.linked ? "broker" : "manual"
  closed.forEach((t, i) => {
    const journaled = rand() < 0.6
    void writer.set(tradesRef.doc(`demo-t${i + 1}`), {
      source,
      accountId,
      instrumentKey: t.instrumentKey,
      ...instrumentFields(t.instrument),
      direction: t.direction,
      status: "closed",
      openedAt: ts(new Date(t.openedAt)),
      closedAt: ts(new Date(t.closedAt)),
      quantity: t.quantity,
      avgEntry: round2(t.avgEntry),
      avgExit: round2(t.avgExit),
      realizedPnl: round2(t.realizedPnl),
      returnPct: Math.round(t.returnPct * 10000) / 10000,
      fees: round2(t.fees),
      alertId: alertByKey.get(t.instrumentKey) ?? null,
      setup: journaled ? pick(SETUPS) : null,
      tags: journaled ? [pick(TAGS)] : [],
      thesis: journaled
        ? "Price held the channel line with volume, and the next line up gave a clear first target."
        : null,
      plan: journaled ? "Enter near the buy point, sell half at T1, stop below the BOC line." : null,
      outcome: journaled
        ? t.realizedPnl >= 0
          ? "Hit the first target and trailed the rest."
          : "Lost the line and hit the stop."
        : null,
      lesson: journaled
        ? t.realizedPnl >= 0
          ? "Taking half at T1 kept the trade stress-free."
          : "Wait for the close above the line before entering."
        : null,
      emotions: journaled ? [pick(EMOTIONS)] : [],
      rating: journaled ? 1 + Math.floor(rand() * 5) : null,
      screenshots: [],
      fills: t.fillIds.flatMap((id) => {
        const f = fillById.get(id)
        return f
          ? [{ id: f.id, side: f.side, quantity: f.quantity, price: f.price, fees: f.fees, executedAt: f.executedAt }]
          : []
      }),
      createdAt: ts(new Date(t.openedAt)),
      updatedAt: ts(new Date(t.closedAt)),
    })
  })
  open.forEach((p, i) => {
    void writer.set(tradesRef.doc(`demo-o${i + 1}`), {
      source,
      accountId,
      instrumentKey: p.instrumentKey,
      ...instrumentFields(p.instrument),
      direction: p.direction,
      status: "open",
      openedAt: ts(new Date(p.openedAt)),
      closedAt: null,
      quantity: p.quantity,
      avgEntry: round2(p.avgEntry),
      avgExit: null,
      realizedPnl: null,
      returnPct: null,
      fees: 0,
      alertId: alertByKey.get(p.instrumentKey) ?? null,
      setup: null,
      tags: [],
      thesis: null,
      plan: null,
      outcome: null,
      lesson: null,
      emotions: [],
      rating: null,
      screenshots: [],
      fills: p.fillIds.flatMap((id) => {
        const f = fillById.get(id)
        return f
          ? [{ id: f.id, side: f.side, quantity: f.quantity, price: f.price, fees: f.fees, executedAt: f.executedAt }]
          : []
      }),
      createdAt: ts(new Date(p.openedAt)),
      updatedAt: ts(new Date(p.openedAt)),
    })
  })
  await writer.close()
  return { closed, open, tickers }
}

async function seedAccount(
  db: Firestore,
  m: DemoMember,
  open: ReturnType<typeof buildTrades>["open"],
  tickers: readonly Ticker[],
  today: IsoDate,
): Promise<void> {
  const uid = uidOf(m.key)
  const memberRef = db.collection(COLLECTIONS.members).doc(uid)
  const isHouse = m.key === "hg"
  const connectionRef = memberRef.collection(MEMBER_SUBCOLLECTIONS.connections).doc("demo-connection")
  const accountRef = memberRef.collection(MEMBER_SUBCOLLECTIONS.accounts).doc("demo-account")
  const brokerageName = isHouse ? "Schwab" : pick(["Webull", "Webull", "Schwab", "Fidelity", "Robinhood"])
  const now = Timestamp.now()
  await connectionRef.set({
    provider: "snaptrade",
    providerAuthId: `demo-${m.key}`,
    brokerageName,
    status: m.key === "hana" ? "needs_reauth" : "active",
    isHouse,
    consentVersion: CONSENT_VERSION,
    consentedAt: now,
    lastSyncedAt: now,
    createdAt: now,
  })

  // Daily account values: a random walk with drift and a few deposits.
  const days = tradingDaysBack(today, 200)
  let value = isHouse ? 250_000 : between(15_000, 90_000)
  const drift = isHouse ? 0.0012 : normal(0.0005, 0.0006) + (m.skill - 0.5) * 0.002
  const writer = db.bulkWriter()
  for (const [i, date] of days.entries()) {
    const flow = i > 0 && date.endsWith("-01") && rand() < 0.5 ? Math.round(between(1, 5)) * 1000 : 0
    if (i > 0) value = value * (1 + normal(drift, isHouse ? 0.009 : 0.014)) + flow
    void writer.set(accountRef.collection(ACCOUNT_SUBCOLLECTIONS.snapshots).doc(date), {
      date,
      value: round2(value),
      cash: round2(value * 0.2),
      netFlow: flow,
    })
  }

  // Holdings: the open journal positions plus a couple of shares positions.
  const holdings: { key: string; data: Record<string, unknown>; mv: number }[] = []
  for (const p of open) {
    const mult = p.instrument.assetType === "option" ? 100 : 1
    const last = round2(p.avgEntry * (1 + normal(0.06, 0.2)))
    holdings.push({
      key: p.instrumentKey,
      mv: last * p.quantity * mult,
      data: {
        instrumentKey: p.instrumentKey,
        ...instrumentFields(p.instrument),
        quantity: p.quantity,
        avgCost: round2(p.avgEntry),
        lastPrice: last,
        marketValue: round2(last * p.quantity * mult),
      },
    })
  }
  for (const t of tickers.filter((x) => x.kind === "stock" && x.metrics).slice(0, 40)) {
    if (holdings.length >= open.length + 2 || rand() < 0.85) continue
    const close = t.metrics?.lastClose ?? 100
    const qty = 10 * (1 + Math.floor(rand() * 10))
    holdings.push({
      key: t.symbol,
      mv: close * qty,
      data: {
        instrumentKey: t.symbol,
        symbol: t.symbol,
        assetType: "stock",
        optionRight: null,
        strike: null,
        expiry: null,
        quantity: qty,
        avgCost: round2(close * between(0.8, 1.05)),
        lastPrice: close,
        marketValue: round2(close * qty),
      },
    })
  }
  for (const h of holdings) {
    void writer.set(accountRef.collection(ACCOUNT_SUBCOLLECTIONS.holdings).doc(h.key.replaceAll("/", "_")), {
      ...h.data,
      asOf: now,
      firstSeenAt: Timestamp.fromDate(new Date(Date.now() - 3 * 86_400_000)),
    })
  }
  await writer.close()
  await accountRef.set({
    connectionId: connectionRef.id,
    providerAccountId: `demo-${m.key}-1`,
    name: isHouse ? "HG Profit Options" : `${brokerageName} individual`,
    numberMask: String(1000 + Math.floor(rand() * 8999)),
    currency: "USD",
    included: true,
    isHouse,
    balance: { total: round2(value), cash: round2(Math.max(0, value - holdings.reduce((s, h) => s + h.mv, 0))) },
    lastSyncedAt: now,
  })
  await memberRef.update({
    brokerage: { linked: true, status: m.key === "hana" ? "needs_reauth" : "active", lastSyncedAt: now },
  })
}

// ---------------------------------------------------------------------------------------------
// Presentations and files
// ---------------------------------------------------------------------------------------------

function simplePdf(title: string, lines: readonly string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  const content = [
    "BT",
    "/F1 22 Tf",
    "72 700 Td",
    `(${esc(title)}) Tj`,
    "/F1 12 Tf",
    ...lines.flatMap((l) => ["0 -26 Td", `(${esc(l)}) Tj`]),
    "ET",
  ].join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"))
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf, "latin1")
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

async function seedContent(db: Firestore, bucket: Bucket, today: IsoDate): Promise<void> {
  const saturdays: IsoDate[] = []
  for (let d = addDays(today, -1); saturdays.length < 4; d = addDays(d, -1))
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 6) saturdays.push(d)
  const topics = [
    "Channel breaks and the BOC bounce",
    "Reading the weekly strike targets",
    "Position sizing for small accounts",
    "Earnings season playbook",
  ]
  for (const [i, day] of saturdays.entries()) {
    const id = `demo-p${i + 1}`
    const path = `content/demo/presentations/${id}.pdf`
    const title = topics[i] ?? "Saturday class"
    await bucket
      .file(path)
      .save(simplePdf(title, ["Saturday class slides (demo)", "Channel lines, BOC levels and the weekly plan."]), {
        contentType: "application/pdf",
      })
    await db
      .collection(COLLECTIONS.presentations)
      .doc(id)
      .set({
        title,
        sessionDate: day,
        summary: "Slides and notes from the Saturday class.",
        slidesPath: path,
        videoUrl: i === 0 ? null : "https://example.com/recording",
        published: true,
        createdAt: Timestamp.now(),
      })
  }
  const files: [string, string, string][] = [
    ["Getting started", "Welcome guide", "How the class, alerts and tools fit together."],
    ["Getting started", "Webull options setup", "Turning on level 2 options and setting up the watchlist."],
    ["Strategy", "Channel and BOC cheat sheet", "How CH and BOC lines are drawn and used."],
    ["Checklists", "Pre-trade checklist", "Ten questions to answer before every entry."],
  ]
  for (const [i, [folder, title, description]] of files.entries()) {
    const id = `demo-r${i + 1}`
    const path = `content/demo/files/${id}.pdf`
    const buffer = simplePdf(title, [description])
    await bucket.file(path).save(buffer, { contentType: "application/pdf" })
    await db.collection(COLLECTIONS.resources).doc(id).set({
      folder,
      title,
      description,
      storagePath: path,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      published: true,
      createdAt: Timestamp.now(),
    })
  }
}

// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  if (flag("prod")) throw new Error("seed:demo only runs against the emulators.")
  const { db, auth, bucket } = initAdmin()
  const today = todayInMarketZone()
  const sharedPassword = option("password")
  await resetDemo(db, auth, bucket)

  const tickers = await ensureMarketData(db, today)
  await ensureBars(db, tickers)
  const settings = memberSettingsSchema.parse({
    zoomUrl: "https://zoom.us/j/0000000000",
    whatsappUrl: "https://chat.whatsapp.com/demo",
    oneOnOneUrl: "https://example.com/book-one-on-one",
  })
  await db.collection(COLLECTIONS.settings).doc("members").set(settings)

  // Alerts: closed trades over the last six weeks, a few open ones and a scheduled one.
  const adminUid = uidOf("hg")
  const stocks = tickers.filter((t) => t.kind === "stock" && t.metrics)
  const outcomes: (number[] | null)[] = [
    [1.52, 1.95],
    [1.48],
    [0.7],
    [1.55, 1.3],
    [1.6, 2.1],
    [0.72],
    [1.5, 1.85],
    null,
    null,
    null,
  ]
  const alerts: DemoAlert[] = []
  outcomes.forEach((outcome, i) => {
    const daysAgo = outcome ? 40 - i * 5 : 3 - (i - 7)
    let day = addDays(today, -daysAgo)
    while (isWeekend(day)) day = addDays(day, -1)
    alerts.push(...optionAlert(`demo-a${i + 1}`, pick(stocks), day, round2(between(2.2, 6.8)), outcome, today))
  })
  const watch = pick(stocks)
  alerts.push({
    kind: "watch",
    symbol: watch.symbol,
    assetType: "stock",
    optionRight: null,
    strike: null,
    expiry: null,
    buyLow: null,
    buyHigh: null,
    sellPoints: [],
    stop: null,
    id: "demo-w1",
    title: `${watch.symbol} on watch`,
    body: `Watching ${watch.symbol} for a close above the next channel line. No entry yet.`,
    parentId: null,
    status: "published",
    publishedAt: at(addDays(today, -1), 15, 20),
    publishAt: null,
    closedAt: null,
    exits: [],
  })
  alerts.push({
    kind: "info",
    symbol: null,
    assetType: null,
    optionRight: null,
    strike: null,
    expiry: null,
    buyLow: null,
    buyHigh: null,
    sellPoints: [],
    stop: null,
    id: "demo-i1",
    title: "Saturday class starts at 7 PM ET this week",
    body: "The beginner session is moved to 6:30 PM ET. Same Zoom link.",
    parentId: null,
    status: "published",
    publishedAt: at(today, 8, 5),
    publishAt: null,
    closedAt: null,
    exits: [],
  })
  const scheduled = pick(stocks)
  const scheduledFields: AlertFields = {
    kind: "buy",
    symbol: scheduled.symbol,
    assetType: "stock",
    optionRight: null,
    strike: null,
    expiry: null,
    buyLow: round2((scheduled.metrics?.lastClose ?? 100) * 0.98),
    buyHigh: round2((scheduled.metrics?.lastClose ?? 100) * 0.99),
    sellPoints: [round2((scheduled.metrics?.lastClose ?? 100) * 1.06)],
    stop: round2((scheduled.metrics?.lastClose ?? 100) * 0.95),
  }
  alerts.push({
    ...scheduledFields,
    id: "demo-s1",
    title: defaultAlertTitle(scheduledFields),
    body: "Shares, not options, for this one.",
    parentId: null,
    status: "scheduled",
    publishedAt: null,
    publishAt: at(addDays(today, 1), 9, 35),
    closedAt: null,
    exits: [],
  })
  const draftFields: AlertFields = {
    kind: "update",
    symbol: scheduled.symbol,
    assetType: null,
    optionRight: null,
    strike: null,
    expiry: null,
    buyLow: null,
    buyHigh: null,
    sellPoints: [],
    stop: null,
  }
  alerts.push({
    ...draftFields,
    id: "demo-d1",
    title: `${scheduled.symbol} update`,
    body: "Draft: raise the stop after earnings.",
    parentId: null,
    status: "draft",
    publishedAt: null,
    publishAt: null,
    closedAt: null,
    exits: [],
  })
  const alertWriter = db.bulkWriter()
  for (const a of alerts) void alertWriter.set(db.collection(COLLECTIONS.alerts).doc(a.id), alertDoc(a, adminUid))
  await alertWriter.close()

  // Members.
  const credentials: [string, string, string][] = []
  for (const m of MEMBERS) {
    const uid = uidOf(m.key)
    const password = sharedPassword ?? randomBytes(9).toString("base64url")
    // Suspended members cannot sign in, as when an admin suspends someone.
    await auth.createUser({
      uid,
      email: m.email,
      emailVerified: true,
      password,
      displayName: m.fullName,
      disabled: m.status === "suspended",
    })
    if (m.role === "admin") await auth.setCustomUserClaims(uid, { role: "admin" })
    credentials.push([m.fullName, m.email, password])
    const memberRef = db.collection(COLLECTIONS.members).doc(uid)
    const createdAt = m.periods[0] ? at(periodFromQuarters(...m.periods[0]).start, 12) : at(addDays(today, -400), 12)
    await memberRef.set({
      email: m.email,
      emailLower: m.email,
      fullName: m.fullName,
      phone: m.phone ?? null,
      whatsapp: m.phone ?? null,
      location: m.location,
      timezone: m.timezone,
      role: m.role,
      status: m.status ?? "active",
      access: null,
      memberSince: null,
      termsAcceptedAt: ts(createdAt),
      prefs: { ...DEFAULT_PREFS, mutedSymbols: m.key === "ava" ? ["TSLA"] : [] },
      brokerage: { linked: false, status: "none", lastSyncedAt: null },
      stats: null,
      createdAt: ts(createdAt),
      createdBy: m.role === "admin" ? null : adminUid,
      lastLoginAt: ts(new Date(Date.now() - between(1, 72) * 3_600_000)),
    })
    for (const spec of m.periods) {
      const period = periodFromQuarters(...spec)
      await memberRef
        .collection(MEMBER_SUBCOLLECTIONS.periods)
        .add({ ...period, note: null, createdAt: ts(createdAt), createdBy: m.role === "admin" ? null : adminUid })
    }
    await recomputeAccess(db, uid, today)
    for (let i = 0; i < 4; i++) {
      await memberRef.collection(MEMBER_SUBCOLLECTIONS.logins).add({
        at: ts(new Date(Date.now() - (i * 2.5 + between(0.1, 2)) * 86_400_000)),
        ip: `203.0.113.${10 + i}`,
        userAgent: i % 2 === 0 ? "Chrome on macOS" : "Safari on iPhone",
        provider: i % 3 === 0 ? "google.com" : "password",
      })
    }

    if (m.linked || m.manualTrades) {
      const { open } = await seedTrades(db, m, m.linked ? "demo-account" : null, tickers, alerts, today)
      if (m.linked) await seedAccount(db, m, open, tickers, today)
    }
    // Most members who had access at the time read the older alerts; HG reads them too.
    for (const a of alerts.filter((x) => x.publishedAt && x.status !== "draft")) {
      if (!a.publishedAt || a.publishedAt.getTime() > Date.now() - 2 * 86_400_000 || rand() >= 0.9) continue
      const publishedOn = isoDateInZone(a.publishedAt)
      const covered = m.periods.some((spec) => {
        const p = periodFromQuarters(...spec)
        return p.start <= publishedOn && publishedOn <= p.end
      })
      if (m.role === "member" && (m.status === "suspended" || !covered)) continue
      // Members who traded the alert said so with "I took this trade".
      const took = await memberRef.collection(MEMBER_SUBCOLLECTIONS.trades).where("alertId", "==", a.id).limit(1).get()
      await memberRef
        .collection(MEMBER_SUBCOLLECTIONS.alertReads)
        .doc(a.id)
        .set({
          alertId: a.id,
          member: m.role === "member",
          readAt: ts(new Date(a.publishedAt.getTime() + 600_000)),
          took: !took.empty,
          tookInstrumentKey: (took.docs[0]?.get("instrumentKey") as string | undefined) ?? null,
        })
    }
    await computeMemberStats(db, uid, today)
  }

  // Ava's market diary.
  const diary = db.collection(COLLECTIONS.members).doc(uidOf("ava")).collection(MEMBER_SUBCOLLECTIONS.journalDays)
  for (let i = 1; i <= 6; i++) {
    let day = addDays(today, -i * 2)
    while (isWeekend(day)) day = addDays(day, -1)
    await diary.doc(day).set({
      date: day,
      body: pick([
        "Choppy open. Waited for the 10 AM candle before acting.",
        "Held my plan on the alert trade and sold half at T1.",
        "Too many tickers on screen today. Focus on three.",
        "Market gapped down; stops did their job.",
      ]),
      mood: 2 + Math.floor(rand() * 4),
      updatedAt: Timestamp.now(),
    })
  }

  // A pending invite, so the admin members list shows one.
  await db
    .collection(COLLECTIONS.invites)
    .doc("new.member@example.com")
    .set({
      email: "new.member@example.com",
      fullName: "Noah Bennett",
      role: "member",
      phone: null,
      whatsapp: null,
      location: "Chicago, Illinois",
      timezone: "America/Chicago",
      notes: "Referred by Ava. Beginner, Webull account ready.",
      periods: [{ ...periodFromQuarters(...q(1), 1), note: null }],
      tokenHash: "0".repeat(64),
      status: "pending",
      expiresAt: ts(new Date(Date.now() + 10 * 86_400_000)),
      createdAt: ts(new Date(Date.now() - 4 * 86_400_000)),
      createdBy: adminUid,
      acceptedUid: null,
      acceptedAt: null,
    })

  await seedContent(db, bucket, today)
  await computeStanding(db, today)
  await db.collection(COLLECTIONS.jobRuns).add({
    job: "seed-demo",
    status: "succeeded",
    startedAt: Timestamp.now(),
    finishedAt: Timestamp.now(),
    detail: `${MEMBERS.length} members, ${alerts.length} alerts`,
  })

  console.log("\nDemo logins (emulators only):")
  for (const [name, email, password] of credentials) console.log(`  ${name.padEnd(16)} ${email.padEnd(28)} ${password}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
