import type { ChannelSettings } from "../domain/types"

export interface ChannelLadder {
  /** The last close. */
  anchor: number
  /** anchor + k * CH for k = -steps..+steps (index `steps` is the anchor). */
  lines: (number | null)[]
  /** anchor + i * CH + BOC for i = 0..steps-1: one BOC beyond each line, toward the next line up. */
  bocAbove: (number | null)[]
  /** anchor - i * CH - BOC for i = 0..steps-1. */
  bocBelow: (number | null)[]
}

/** The source sheet hides values <= 0. Rounded to 4 decimals to remove floating-point noise. */
function visible(value: number): number | null {
  return value > 0 ? Math.round(value * 1e4) / 1e4 : null
}

export function channelLadder(anchor: number, { ch, boc }: ChannelSettings, steps = 4): ChannelLadder {
  return {
    anchor,
    lines: Array.from({ length: steps * 2 + 1 }, (_, i) => visible(anchor + (i - steps) * ch)),
    bocAbove: Array.from({ length: steps }, (_, i) => visible(anchor + i * ch + boc)),
    bocBelow: Array.from({ length: steps }, (_, i) => visible(anchor - i * ch - boc)),
  }
}

export function ladderLevels(ladder: ChannelLadder): number[] {
  return [...ladder.lines, ...ladder.bocAbove, ...ladder.bocBelow].filter((v): v is number => v !== null).sort((a, b) => a - b)
}

/** Closest channel or BOC level strictly above and strictly below the price. */
export function nearestLevels(price: number, ladder: ChannelLadder): { above: number | null; below: number | null } {
  const levels = ladderLevels(ladder)
  return {
    above: levels.find((v) => v > price) ?? null,
    below: [...levels].reverse().find((v) => v < price) ?? null,
  }
}

/** The nearest channel or BOC level to a value, used as a hint in the strike-target editor. */
export function nearestLevel(value: number, ladder: ChannelLadder): number | null {
  const levels = ladderLevels(ladder)
  let best: number | null = null
  for (const level of levels) if (best === null || Math.abs(level - value) < Math.abs(best - value)) best = level
  return best
}

/** Distance from price to level as a fraction of price (positive when the level is above). */
export function distancePct(price: number, level: number): number {
  return (level - price) / price
}
