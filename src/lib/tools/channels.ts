import "server-only"
import { channelLadder, distancePct, nearestLevels } from "@/core/calc/channels"
import { medians } from "@/core/calc/medians"
import { daysBetween, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { categoriesBySymbol, listActiveTickers } from "@/lib/data/tools"

export interface ChannelRow {
  symbol: string
  name: string | null
  price: number
  lastClose: number
  asOf: IsoDate
  ch: number
  boc: number
  m5: number | null
  m30: number | null
  m90: number | null
  above: number | null
  below: number | null
  toAbove: number | null
  toBelow: number | null
  lines: number[]
  bocLevels: number[]
  earningsStart: IsoDate | null
  earningsEnd: IsoDate | null
  /** Days until the earnings window starts (0 while it is open), or null. */
  earningsIn: number | null
  fs: number[]
  ss: number[]
  groups: string[]
}

/** Channel ladder, medians and nearest levels for every ticker with channel settings. */
export async function buildChannelRows(): Promise<ChannelRow[]> {
  const [tickers, categories] = await Promise.all([listActiveTickers(), categoriesBySymbol()])
  const today = todayInMarketZone()
  const rows: ChannelRow[] = []
  for (const t of tickers) {
    if (t.kind !== "stock" || t.channelSize === null || t.bocSize === null || !t.metrics) continue
    const anchor = t.metrics.lastClose
    const price = t.metrics.price ?? anchor
    const ladder = channelLadder(anchor, { ch: t.channelSize, boc: t.bocSize })
    const near = nearestLevels(price, ladder)
    const m = medians(t.metrics)
    const earningsIn =
      t.earningsStart && t.earningsEnd && t.earningsEnd >= today
        ? Math.max(0, daysBetween(today, t.earningsStart))
        : null
    rows.push({
      symbol: t.symbol,
      name: t.name,
      price,
      lastClose: anchor,
      asOf: t.metrics.asOf,
      ch: t.channelSize,
      boc: t.bocSize,
      ...m,
      above: near.above,
      below: near.below,
      toAbove: near.above === null ? null : distancePct(price, near.above),
      toBelow: near.below === null ? null : distancePct(price, near.below),
      lines: ladder.lines.filter((v): v is number => v !== null),
      bocLevels: [...ladder.bocAbove, ...ladder.bocBelow].filter((v): v is number => v !== null),
      earningsStart: t.earningsStart ?? null,
      earningsEnd: t.earningsEnd ?? null,
      earningsIn,
      fs: t.fsLevels,
      ss: t.ssLevels,
      groups: categories.get(t.symbol) ?? [],
    })
  }
  return rows
}
