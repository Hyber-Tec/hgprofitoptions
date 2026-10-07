import "server-only"
import { positionInRange } from "@/core/calc/kmd"
import type { WeekDoc } from "@/server/model"
import { categoriesBySymbol, getTargetGroups, getWeek, listWeeks } from "@/lib/data/tools"

export interface WeekRow {
  symbol: string
  pfcp: number
  high: number
  low: number
  close: number
  change: number
  changePct: number
  range: number
  svi: number
  /** 0 at the week's low, 1 at its high. */
  position: number
  previousSvi: number | null
  categories: string[]
}

export interface IndexCard {
  symbol: string
  name: string
  close: number
  change: number
  changePct: number
  range: number
  svi: number
  history: number[]
}

const INDEX_NAMES: Record<string, string> = { DJI: "Dow Jones", SPX: "S&P 500", IXIC: "Nasdaq" }

export function weekRows(week: WeekDoc, previous: WeekDoc | null, categories: Map<string, string[]>): WeekRow[] {
  return Object.entries(week.rows)
    .map(([symbol, r]) => ({
      symbol,
      ...r,
      change: r.close - r.pfcp,
      changePct: (r.close - r.pfcp) / r.pfcp,
      position: positionInRange(r),
      previousSvi: previous?.rows[symbol]?.svi ?? null,
      categories: categories.get(symbol) ?? [],
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/** Index cards with up to 12 weeks of closes for the sparkline. */
export async function indexCards(week: WeekDoc): Promise<IndexCard[]> {
  const weeks = (await listWeeks()).filter((w) => w.weekStart <= week.weekStart).slice(0, 12)
  const docs = (await Promise.all(weeks.map((w) => getWeek(w.weekStart))))
    .filter((w): w is WeekDoc => w !== null)
    .reverse()
  return Object.keys(INDEX_NAMES).flatMap((symbol) => {
    const r = week.indices[symbol]
    if (!r) return []
    return [
      {
        symbol,
        name: INDEX_NAMES[symbol] ?? symbol,
        close: r.close,
        change: r.close - r.pfcp,
        changePct: (r.close - r.pfcp) / r.pfcp,
        range: r.range,
        svi: r.svi,
        history: docs.flatMap((d) => (d.indices[symbol] ? [d.indices[symbol].close] : [])),
      },
    ]
  })
}

export async function marketDataView(week: WeekDoc, previous: WeekDoc | null) {
  const [categories, groups] = await Promise.all([categoriesBySymbol(), getTargetGroups()])
  return {
    rows: weekRows(week, previous, categories),
    indices: await indexCards(week),
    groups: groups.map((g) => ({ slug: g.slug, shortName: g.shortName })),
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
  }
}
