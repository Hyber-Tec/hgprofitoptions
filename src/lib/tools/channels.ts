import "server-only"
import { channelLadder } from "@/core/calc/channels"
import { medians } from "@/core/calc/medians"
import { daysBetween, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { categoriesBySymbol, listActiveTickers } from "@/lib/data/tools"

export interface ChannelRow {
  symbol: string
  name: string | null
  /** The last close: the middle of the ladder. */
  anchor: number
  asOf: IsoDate
  ch: number
  boc: number
  m5: number | null
  m30: number | null
  m90: number | null
  /** anchor + k x CH for k = -4..4; null where the level would be zero or less. */
  lines: (number | null)[]
  /** One BOC beyond each line toward the next one: below the anchor (nearest first) and above it. */
  bocBelow: (number | null)[]
  bocAbove: (number | null)[]
  earningsStart: IsoDate | null
  earningsEnd: IsoDate | null
  /** Days until the earnings window starts (0 while it is open), or null. */
  earningsIn: number | null
  fs: number[]
  ss: number[]
  groups: string[]
}

/** The channel ladder, medians and levels of every active stock with channel settings, as in HG's sheet. */
export async function buildChannelRows(): Promise<ChannelRow[]> {
  const [tickers, categories] = await Promise.all([listActiveTickers(), categoriesBySymbol()])
  const today = todayInMarketZone()
  const rows: ChannelRow[] = []
  for (const t of tickers) {
    if (t.kind !== "stock" || t.channelSize === null || t.bocSize === null || !t.metrics) continue
    const anchor = t.metrics.lastClose
    const ladder = channelLadder(anchor, { ch: t.channelSize, boc: t.bocSize })
    const earningsIn =
      t.earningsStart && t.earningsEnd && t.earningsEnd >= today
        ? Math.max(0, daysBetween(today, t.earningsStart))
        : null
    rows.push({
      symbol: t.symbol,
      name: t.name,
      anchor,
      asOf: t.metrics.asOf,
      ch: t.channelSize,
      boc: t.bocSize,
      ...medians(t.metrics),
      lines: ladder.lines,
      bocBelow: ladder.bocBelow,
      bocAbove: ladder.bocAbove,
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
