/**
 * Portfolio and journal reads plus the derived member statistics, shared by the web app and
 * Cloud Functions (no Next.js imports).
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { addDays, isoDateInZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { journalStats } from "@/core/calc/journal-stats"
import { combineSnapshots, maxDrawdown, periodReturn, timeWeightedReturn, type Snapshot } from "@/core/calc/returns"
import { quarterOf, quarterRange } from "@/core/membership/quarters"
import {
  ACCOUNT_SUBCOLLECTIONS,
  COLLECTIONS,
  MEMBER_SUBCOLLECTIONS,
  accountSchema,
  connectionSchema,
  holdingSchema,
  parseDoc,
  snapshotSchema,
  tradeSchema,
  type AccountDoc,
  type ConnectionDoc,
  type HoldingDoc,
  type MemberStats,
  type TradeDoc,
} from "./model"

const member = (db: Firestore, uid: string) => db.collection(COLLECTIONS.members).doc(uid)

export async function readConnections(db: Firestore, uid: string): Promise<ConnectionDoc[]> {
  const snap = await member(db, uid).collection(MEMBER_SUBCOLLECTIONS.connections).get()
  return snap.docs.map((d) => parseDoc(connectionSchema, d.id, d.data())).filter((c): c is ConnectionDoc => c !== null)
}

export async function readAccounts(db: Firestore, uid: string): Promise<AccountDoc[]> {
  const snap = await member(db, uid).collection(MEMBER_SUBCOLLECTIONS.accounts).get()
  return snap.docs.map((d) => parseDoc(accountSchema, d.id, d.data())).filter((a): a is AccountDoc => a !== null)
}

export async function readHoldings(db: Firestore, uid: string, accountId: string): Promise<HoldingDoc[]> {
  const snap = await member(db, uid)
    .collection(MEMBER_SUBCOLLECTIONS.accounts)
    .doc(accountId)
    .collection(ACCOUNT_SUBCOLLECTIONS.holdings)
    .get()
  return snap.docs.map((d) => parseDoc(holdingSchema, d.id, d.data())).filter((h): h is HoldingDoc => h !== null)
}

export type SnapshotPoint = Snapshot & { cash: number | null }

export async function readSnapshots(
  db: Firestore,
  uid: string,
  accountId: string,
  since?: IsoDate,
): Promise<SnapshotPoint[]> {
  let query = member(db, uid)
    .collection(MEMBER_SUBCOLLECTIONS.accounts)
    .doc(accountId)
    .collection(ACCOUNT_SUBCOLLECTIONS.snapshots)
    .orderBy("date")
  if (since) query = query.where("date", ">=", since)
  const snap = await query.get()
  return snap.docs.flatMap((d) => {
    const parsed = snapshotSchema.safeParse(d.data())
    return parsed.success
      ? [{ date: parsed.data.date, value: parsed.data.value, netFlow: parsed.data.netFlow, cash: parsed.data.cash }]
      : []
  })
}

/** The combined daily series of the accounts that count toward a member's stats (or HG's house accounts). */
export async function portfolioSeries(
  db: Firestore,
  uid: string,
  options: { houseOnly?: boolean } = {},
): Promise<{ accounts: AccountDoc[]; series: Snapshot[] }> {
  const accounts = (await readAccounts(db, uid)).filter((a) => (options.houseOnly ? a.isHouse : a.included))
  const perAccount = await Promise.all(accounts.map((a) => readSnapshots(db, uid, a.id)))
  return { accounts, series: combineSnapshots(perAccount) }
}

export interface ReturnsBlock {
  week: number | null
  month: number | null
  qtd: number | null
  ytd: number | null
  all: number | null
}

export function returnsBlock(series: readonly Snapshot[], today: IsoDate): ReturnsBlock {
  if (series.length < 2) return { week: null, month: null, qtd: null, ytd: null, all: null }
  const { year, q } = quarterOf(today)
  return {
    week: periodReturn(series, addDays(today, -6), today),
    month: periodReturn(series, addDays(today, -29), today),
    qtd: periodReturn(series, quarterRange(year, q).start, today),
    ytd: periodReturn(series, `${year}-01-01` as IsoDate, today),
    all: timeWeightedReturn(series),
  }
}

export async function readTrades(
  db: Firestore,
  uid: string,
  options: { status?: "open" | "closed"; limit?: number } = {},
): Promise<TradeDoc[]> {
  let query = member(db, uid).collection(MEMBER_SUBCOLLECTIONS.trades).orderBy("openedAt", "desc")
  if (options.status)
    query = member(db, uid)
      .collection(MEMBER_SUBCOLLECTIONS.trades)
      .where("status", "==", options.status)
      .orderBy(options.status === "closed" ? "closedAt" : "openedAt", "desc")
  if (options.limit) query = query.limit(options.limit)
  const snap = await query.get()
  return snap.docs.map((d) => parseDoc(tradeSchema, d.id, d.data())).filter((t): t is TradeDoc => t !== null)
}

/** The ET calendar date a trade closed on. */
export function closedDay(trade: Pick<TradeDoc, "closedAt">): IsoDate | null {
  return trade.closedAt ? isoDateInZone(trade.closedAt) : null
}

/**
 * Recomputes the stats block on the member document (used by the admin performance table and the
 * community standing). Returns are time-weighted from linked accounts; trade stats come from the journal.
 */
export async function computeMemberStats(db: Firestore, uid: string, today: IsoDate): Promise<MemberStats> {
  const [{ series }, trades] = await Promise.all([portfolioSeries(db, uid), readTrades(db, uid)])
  const { year, q } = quarterOf(today)
  const quarter = quarterRange(year, q)
  const returns = returnsBlock(series, today)
  const closedThisQuarter = trades.filter((t) => {
    const day = closedDay(t)
    return t.status === "closed" && day !== null && day >= quarter.start && day <= today
  })
  const touchedThisQuarter = trades.filter(
    (t) => isoDateInZone(t.openedAt) >= quarter.start || closedThisQuarter.includes(t),
  )
  const stats = journalStats(
    closedThisQuarter.map((t) => ({ realizedPnl: t.realizedPnl ?? 0, closedAt: t.closedAt?.toISOString() ?? "" })),
  )
  const quarterSeries = series.filter((s) => s.date >= addDays(quarter.start, -7))
  const latest = series.at(-1)
  const result: MemberStats = {
    qtdReturn: returns.qtd,
    ytdReturn: returns.ytd,
    monthReturn: returns.month,
    weekReturn: returns.week,
    realizedQtd: closedThisQuarter.length > 0 ? stats.totalPnl : null,
    winRateQtd: stats.winRate,
    tradesQtd: closedThisQuarter.length,
    followedAlertsPct:
      touchedThisQuarter.length > 0
        ? touchedThisQuarter.filter((t) => t.alertId !== null).length / touchedThisQuarter.length
        : null,
    maxDrawdownQtd: quarterSeries.length >= 2 ? maxDrawdown(quarterSeries) : null,
    portfolioValue: latest ? latest.value : null,
    computedAt: new Date(),
  }
  await member(db, uid).update({
    stats: { ...result, computedAt: Timestamp.fromDate(result.computedAt ?? new Date()) },
  })
  return result
}
