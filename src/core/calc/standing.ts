export interface AlertExit {
  price: number
  /** Portions of one alert sum to 1 once it is fully closed. */
  portion: number
}

/** Closed buy alert: entry = midpoint of the buy point, exit = portion-weighted exit price. */
export function alertReturn(buyLow: number, buyHigh: number, exits: readonly AlertExit[]): number | null {
  const entry = (buyLow + buyHigh) / 2
  const total = exits.reduce((acc, e) => acc + e.portion, 0)
  if (entry <= 0 || total <= 0) return null
  const exit = exits.reduce((acc, e) => acc + e.price * e.portion, 0) / total
  return (exit - entry) / entry
}

export interface TrackRecord {
  closed: number
  wins: number
  winRate: number | null
  averageReturn: number | null
  medianReturn: number | null
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

export function trackRecord(returns: readonly number[]): TrackRecord {
  const wins = returns.filter((r) => r > 0).length
  return {
    closed: returns.length,
    wins,
    winRate: returns.length > 0 ? wins / returns.length : null,
    averageReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
    medianReturn: median(returns),
  }
}

/** Never show community numbers that could identify a member. */
export const MIN_COHORT = 5

export interface CommunityStanding {
  members: number
  pctGreen: number
  medianReturn: number
  averageReturn: number
}

export function communityStanding(memberReturns: readonly number[]): CommunityStanding | null {
  if (memberReturns.length < MIN_COHORT) return null
  return {
    members: memberReturns.length,
    pctGreen: memberReturns.filter((r) => r > 0).length / memberReturns.length,
    medianReturn: median(memberReturns) ?? 0,
    averageReturn: memberReturns.reduce((a, b) => a + b, 0) / memberReturns.length,
  }
}
