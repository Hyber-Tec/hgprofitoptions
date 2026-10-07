import "server-only"
import type { IsoDate } from "@/core/domain/types"
import { diffTargets, targetStatus, type TargetStatus } from "@/core/parsers/strike-targets"
import type { TargetUpdate } from "@/server/model"
import { openAlertSymbols } from "@/lib/data/alerts"
import { getEtfConfig, getTargetGroups, tickerMap } from "@/lib/data/tools"

export type ChangedField = "target" | "breakLevel" | "putStrike" | "expiry" | "group"

export interface TargetRow {
  symbol: string
  name: string | null
  group: string
  position: number
  target: number
  breakLevel: number
  putStrike: number
  expiry: IsoDate
  dowWeight: number | null
  note: string | null
  lastClose: number | null
  lastCloseDate: IsoDate | null
  /** (target - last) / last: how far price is from the target. */
  toTarget: number | null
  toBreak: number | null
  status: TargetStatus | null
  etf: string | null
  alertId: string | null
  change: "new" | "changed" | null
  previous: Partial<Record<ChangedField, string | number>> | null
}

export interface RemovedRow {
  symbol: string
  group: string
  target: number
  breakLevel: number
  putStrike: number
  expiry: IsoDate
}

export interface GroupTab {
  slug: string
  name: string
  shortName: string
  description: string | null
  count: number
  hasWeights: boolean
}

/** Everything the Strike Price Targets table shows, joined with live closes, ETFs and open alerts. */
export async function buildTargetRows(
  update: TargetUpdate,
  previous: TargetUpdate | null,
): Promise<{ rows: TargetRow[]; removed: RemovedRow[]; groups: GroupTab[] }> {
  const [tickers, groupConfig, etfs, alerts] = await Promise.all([
    tickerMap(),
    getTargetGroups(),
    getEtfConfig(),
    openAlertSymbols(),
  ])
  const etfBySymbol = new Map(etfs.pairs.map((p) => [p.underlying, p.etf]))
  const diff = previous ? diffTargets(previous.entries, update.entries) : null
  const added = new Set(diff?.added.map((t) => t.symbol) ?? [])
  const changed = new Map(diff?.changed.map((c) => [c.after.symbol, c]) ?? [])

  const rows: TargetRow[] = update.entries.map((e) => {
    const ticker = tickers.get(e.symbol)
    const last = ticker?.metrics?.lastClose ?? null
    const change = changed.get(e.symbol)
    return {
      symbol: e.symbol,
      name: ticker?.name ?? null,
      group: e.group,
      position: e.position,
      target: e.target,
      breakLevel: e.breakLevel,
      putStrike: e.putStrike,
      expiry: e.expiry,
      dowWeight: e.dowWeight,
      note: e.note,
      lastClose: last,
      lastCloseDate: ticker?.metrics?.asOf ?? null,
      toTarget: last ? (e.target - last) / last : null,
      toBreak: last ? (e.breakLevel - last) / last : null,
      status: last ? targetStatus(last, e) : null,
      etf: etfBySymbol.get(e.symbol) ?? null,
      alertId: alerts.get(e.symbol) ?? null,
      change: added.has(e.symbol) && previous ? "new" : change ? "changed" : null,
      previous: change ? Object.fromEntries(change.fields.map((f) => [f, change.before[f]])) : null,
    }
  })

  const known = new Map(groupConfig.map((g) => [g.slug, g]))
  const slugs = [...new Set(update.entries.map((e) => e.group))].sort(
    (a, b) => (known.get(a)?.order ?? 99) - (known.get(b)?.order ?? 99),
  )
  const groups: GroupTab[] = slugs.map((slug) => {
    const config = known.get(slug)
    const inGroup = rows.filter((r) => r.group === slug)
    return {
      slug,
      name: config?.name ?? slug,
      shortName: config?.shortName ?? config?.name ?? slug,
      description: config?.description ?? null,
      count: inGroup.length,
      hasWeights: inGroup.some((r) => r.dowWeight !== null),
    }
  })

  const removed: RemovedRow[] = (diff?.removed ?? []).map((t) => ({
    symbol: t.symbol,
    group: t.group,
    target: t.target,
    breakLevel: t.breakLevel,
    putStrike: t.putStrike,
    expiry: t.expiry,
  }))
  return { rows, removed, groups }
}
