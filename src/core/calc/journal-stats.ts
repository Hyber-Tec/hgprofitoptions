import type { ClosedTrade } from "../domain/types"

export interface JournalStats {
  trades: number
  wins: number
  losses: number
  /** wins / (wins + losses); break-even trades are excluded. */
  winRate: number | null
  avgWin: number | null
  avgLoss: number | null
  /** Gross profit / gross loss; null when there are no losses. */
  profitFactor: number | null
  /** Average realized P&L per closed trade. */
  expectancy: number | null
  best: number | null
  worst: number | null
  totalPnl: number
  maxWinStreak: number
  maxLossStreak: number
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

export function journalStats(closed: readonly Pick<ClosedTrade, "realizedPnl" | "closedAt">[]): JournalStats {
  const pnls = [...closed].sort((a, b) => a.closedAt.localeCompare(b.closedAt)).map((t) => t.realizedPnl)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)

  let winRun = 0
  let lossRun = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  for (const p of pnls) {
    winRun = p > 0 ? winRun + 1 : 0
    lossRun = p < 0 ? lossRun + 1 : 0
    maxWinStreak = Math.max(maxWinStreak, winRun)
    maxLossStreak = Math.max(maxLossStreak, lossRun)
  }

  const decided = wins.length + losses.length
  return {
    trades: pnls.length,
    wins: wins.length,
    losses: losses.length,
    winRate: decided > 0 ? wins.length / decided : null,
    avgWin: wins.length > 0 ? sum(wins) / wins.length : null,
    avgLoss: losses.length > 0 ? sum(losses) / losses.length : null,
    profitFactor: losses.length > 0 ? sum(wins) / Math.abs(sum(losses)) : null,
    expectancy: pnls.length > 0 ? sum(pnls) / pnls.length : null,
    best: pnls.length > 0 ? Math.max(...pnls) : null,
    worst: pnls.length > 0 ? Math.min(...pnls) : null,
    totalPnl: Math.round(sum(pnls) * 100) / 100,
    maxWinStreak,
    maxLossStreak,
  }
}

/** Realized P&L summed per calendar day (keyed "YYYY-MM-DD" in the given zone), for the heatmap. */
export function dailyPnl(closed: readonly Pick<ClosedTrade, "realizedPnl" | "closedAt">[], toDay: (iso: string) => string): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of closed) {
    const day = toDay(t.closedAt)
    out.set(day, Math.round(((out.get(day) ?? 0) + t.realizedPnl) * 100) / 100)
  }
  return out
}
