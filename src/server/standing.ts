/**
 * HG standing: HG's house portfolio, the alerts track record and the anonymized community numbers.
 * Written to standing/current by a scheduled job and after admin changes. Only what members may see
 * is stored, so the document can be shown as is.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { isoDateInZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { growthIndex } from "@/core/calc/returns"
import { communityStanding, median, trackRecord } from "@/core/calc/standing"
import { membershipStatus } from "@/core/membership/quarters"
import { readPeriods, toMembershipPeriods } from "./members"
import {
  COLLECTIONS,
  alertSchema,
  memberSchema,
  memberSettingsSchema,
  parseDoc,
  type AlertDoc,
  type StandingDoc,
} from "./model"
import { portfolioSeries, readHoldings, readTrades, returnsBlock } from "./portfolio"

export const STANDING_DOC = "current"

export async function computeStanding(db: Firestore, today: IsoDate): Promise<StandingDoc> {
  const [membersSnap, alertsSnap, settingsSnap] = await Promise.all([
    db.collection(COLLECTIONS.members).get(),
    db.collection(COLLECTIONS.alerts).where("status", "==", "closed").get(),
    db.collection(COLLECTIONS.settings).doc("members").get(),
  ])
  const settings = memberSettingsSchema.parse(settingsSnap.data() ?? {})
  const visibility = settings.hgPortfolio
  const members = membersSnap.docs
    .map((d) => ({ uid: d.id, member: parseDoc(memberSchema, d.id, d.data()) }))
    .filter((m) => m.member !== null)

  // ---- HG's house accounts (admins' accounts flagged as house) --------------------------------
  let hgPortfolio: StandingDoc["hgPortfolio"] = null
  for (const { uid, member } of members) {
    if (member?.role !== "admin") continue
    const { accounts, series } = await portfolioSeries(db, uid, { houseOnly: true })
    if (accounts.length === 0 || series.length < 2) continue
    const delayMs = visibility.positionDelayHours * 60 * 60 * 1000
    const holdings = visibility.showPositions
      ? (await Promise.all(accounts.map((a) => readHoldings(db, uid, a.id)))).flat()
      : []
    const visibleHoldings = holdings.filter((h) => (h.firstSeenAt ?? h.asOf).getTime() <= Date.now() - delayMs)
    const totalValue = visibleHoldings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0)
    const houseAccountIds = new Set(accounts.map((a) => a.id))
    const closed = visibility.showClosedTrades
      ? (await readTrades(db, uid, { status: "closed", limit: 100 }))
          .filter((t) => t.accountId !== null && houseAccountIds.has(t.accountId))
          .slice(0, 20)
      : null
    hgPortfolio = {
      returns: returnsBlock(series, today),
      curve: growthIndex(series).map((p) => ({ date: p.date, index: Math.round(p.index * 1e6) / 1e6 })),
      value: visibility.showDollars ? (series.at(-1)?.value ?? null) : null,
      positions: visibility.showPositions
        ? visibleHoldings.map((h) => ({
            instrumentKey: h.instrumentKey,
            symbol: h.symbol,
            quantity: visibility.showDollars ? h.quantity : null,
            marketValue: visibility.showDollars ? h.marketValue : null,
            weight: totalValue > 0 && h.marketValue !== null ? h.marketValue / totalValue : null,
          }))
        : null,
      closedTrades: closed
        ? closed.map((t) => ({
            instrumentKey: t.instrumentKey,
            closedAt: t.closedAt?.toISOString() ?? "",
            returnPct: t.returnPct,
            realizedPnl: visibility.showDollars ? t.realizedPnl : null,
          }))
        : null,
    }
    break
  }

  // ---- Alerts track record: closed root buy alerts with a result ------------------------------
  const closedAlerts = alertsSnap.docs
    .map((d) => parseDoc(alertSchema, d.id, d.data()))
    .filter((a): a is AlertDoc => a !== null && a.parentId === null && a.resultPct !== null && a.closedAt !== null)
  const byMonthMap = new Map<string, number[]>()
  for (const alert of closedAlerts) {
    if (alert.closedAt === null || alert.resultPct === null) continue
    const month = isoDateInZone(alert.closedAt).slice(0, 7)
    byMonthMap.set(month, [...(byMonthMap.get(month) ?? []), alert.resultPct])
  }
  const record = trackRecord(closedAlerts.flatMap((a) => (a.resultPct === null ? [] : [a.resultPct])))
  const byMonth = [...byMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, returns]) => ({
      month,
      closed: returns.length,
      averageReturn: returns.reduce((s, r) => s + r, 0) / returns.length,
    }))

  // ---- Community: active, linked, non-admin members with a quarter-to-date return ------------
  const cohort: { qtd: number; winRate: number | null; trades: number }[] = []
  for (const { uid, member } of members) {
    if (!member || member.role !== "member" || !member.brokerage.linked || member.stats?.qtdReturn == null) continue
    const status = membershipStatus({
      role: member.role,
      status: member.status,
      periods: toMembershipPeriods(await readPeriods(db, uid)),
      today,
    })
    if (status.kind !== "active") continue
    cohort.push({ qtd: member.stats.qtdReturn, winRate: member.stats.winRateQtd, trades: member.stats.tradesQtd })
  }
  const community = communityStanding(cohort.map((c) => c.qtd))
  const winRates = cohort.flatMap((c) => (c.winRate === null ? [] : [c.winRate]))

  const standing: StandingDoc = {
    computedAt: new Date(),
    hgPortfolio,
    alertsTrackRecord: {
      ...record,
      medianReturn: median(closedAlerts.flatMap((a) => (a.resultPct === null ? [] : [a.resultPct]))),
      byMonth,
    },
    community: community
      ? {
          ...community,
          averageWinRate: winRates.length > 0 ? winRates.reduce((s, r) => s + r, 0) / winRates.length : null,
          totalTrades: cohort.reduce((s, c) => s + c.trades, 0),
        }
      : null,
  }
  await db
    .collection(COLLECTIONS.standing)
    .doc(STANDING_DOC)
    .set({ ...standing, computedAt: Timestamp.fromDate(standing.computedAt) })
  return standing
}
