import type { IsoDate } from "../domain/types"

export interface Snapshot {
  date: IsoDate
  /** Total account value at the close. */
  value: number
  /** Deposits minus withdrawals that day, assumed to arrive at the end of the day. */
  netFlow: number
}

function sorted(snapshots: readonly Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
}

/** Daily growth factors, so deposits and withdrawals never count as performance. */
function growthFactors(snapshots: readonly Snapshot[]): { date: IsoDate; factor: number }[] {
  const list = sorted(snapshots)
  const out: { date: IsoDate; factor: number }[] = []
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]
    const cur = list[i]
    if (!prev || !cur || prev.value <= 0) continue
    out.push({ date: cur.date, factor: (cur.value - cur.netFlow) / prev.value })
  }
  return out
}

/** Time-weighted return over the snapshots (first snapshot is the starting point). */
export function timeWeightedReturn(snapshots: readonly Snapshot[]): number {
  return growthFactors(snapshots).reduce((growth, g) => growth * g.factor, 1) - 1
}

/** A growth index starting at 1 on the first snapshot, used for equity curves in percent. */
export function growthIndex(snapshots: readonly Snapshot[]): { date: IsoDate; index: number }[] {
  const list = sorted(snapshots)
  const first = list[0]
  if (!first) return []
  const out = [{ date: first.date, index: 1 }]
  let index = 1
  for (const g of growthFactors(list)) {
    index *= g.factor
    out.push({ date: g.date, index })
  }
  return out
}

/** Largest peak-to-trough fall of the growth index, as a negative fraction (e.g. -0.18), or 0. */
export function maxDrawdown(snapshots: readonly Snapshot[]): number {
  let peak = Number.NEGATIVE_INFINITY
  let worst = 0
  for (const point of growthIndex(snapshots)) {
    peak = Math.max(peak, point.index)
    worst = Math.min(worst, point.index / peak - 1)
  }
  return worst
}

/**
 * Time-weighted return for a period: from the last snapshot before `start` through `end`.
 * Returns null when there is no snapshot to start from.
 */
export function periodReturn(snapshots: readonly Snapshot[], start: IsoDate, end: IsoDate): number | null {
  const list = sorted(snapshots)
  const before = list.filter((s) => s.date < start).at(-1)
  const inside = list.filter((s) => s.date >= start && s.date <= end)
  const base = before ?? inside[0]
  if (!base) return null
  const window = before ? [before, ...inside] : inside
  if (window.length < 2) return 0
  return timeWeightedReturn(window)
}

/** Combines several accounts into one series by summing values and flows per day. */
export function combineSnapshots(accounts: readonly (readonly Snapshot[])[]): Snapshot[] {
  const byDate = new Map<IsoDate, Snapshot>()
  for (const account of accounts) {
    for (const s of account) {
      const existing = byDate.get(s.date)
      if (existing) {
        existing.value += s.value
        existing.netFlow += s.netFlow
      } else {
        byDate.set(s.date, { ...s })
      }
    }
  }
  return sorted([...byDate.values()])
}
