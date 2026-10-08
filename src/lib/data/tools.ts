import "server-only"
import { cache } from "react"
import { lastCompletedWeek, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import {
  COLLECTIONS,
  etfConfigSchema,
  parseDoc,
  standingSchema,
  targetGroupsSchema,
  targetUpdateSchema,
  tickerBarsSchema,
  tickerSchema,
  weekSchema,
  type EtfConfig,
  type StandingDoc,
  type TargetGroupConfig,
  type TargetUpdate,
  type Ticker,
  type TickerBars,
  type WeekDoc,
} from "@/server/model"
import { STANDING_DOC } from "@/server/standing"
import { adminDb } from "@/lib/firebase/admin"
import { memo } from "./cache"

const MINUTE = 60_000

export type TickerRecord = Ticker & { id: string }

export function listTickers(): Promise<TickerRecord[]> {
  return memo("tools:tickers", MINUTE, async () => {
    const snap = await adminDb().collection(COLLECTIONS.tickers).get()
    return snap.docs
      .map((d) => parseDoc(tickerSchema, d.id, d.data()))
      .filter((t): t is TickerRecord => t !== null)
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  })
}

export async function listActiveTickers(): Promise<TickerRecord[]> {
  return (await listTickers()).filter((t) => t.active)
}

export async function tickerMap(): Promise<Map<string, TickerRecord>> {
  return new Map((await listTickers()).map((t) => [t.symbol, t]))
}

export async function getTicker(symbol: string): Promise<TickerRecord | null> {
  return (await tickerMap()).get(symbol.toUpperCase()) ?? null
}

export function getTargetGroups(): Promise<TargetGroupConfig[]> {
  return memo("tools:targetGroups", 5 * MINUTE, async () => {
    const snap = await adminDb().collection(COLLECTIONS.config).doc("targetGroups").get()
    const parsed = targetGroupsSchema.safeParse(snap.data() ?? { groups: [] })
    return parsed.success ? [...parsed.data.groups].sort((a, b) => a.order - b.order) : []
  })
}

export function getEtfConfig(): Promise<EtfConfig> {
  return memo("tools:etfs", 5 * MINUTE, async () => {
    const snap = await adminDb().collection(COLLECTIONS.config).doc("leveragedEtfs").get()
    const parsed = etfConfigSchema.safeParse(snap.data() ?? { guidance: [], pairs: [] })
    return parsed.success ? parsed.data : { guidance: [], pairs: [] }
  })
}

export interface TargetUpdateSummary {
  id: string
  effectiveDate: IsoDate
  title: string
  entries: number
  revision: number
}

/** Published strike target updates, newest first. */
export function listTargetUpdates(): Promise<TargetUpdate[]> {
  return memo("tools:targetUpdates", MINUTE, async () => {
    const snap = await adminDb()
      .collection(COLLECTIONS.targetUpdates)
      .where("status", "==", "published")
      .orderBy("effectiveDate", "desc")
      .limit(60)
      .get()
    return snap.docs
      .map((d) => parseDoc(targetUpdateSchema, d.id, d.data()))
      .filter((u): u is TargetUpdate => u !== null)
  })
}

export async function latestTargetUpdate(): Promise<TargetUpdate | null> {
  return (await listTargetUpdates())[0] ?? null
}

export async function getTargetUpdate(
  effectiveDate: string,
): Promise<{ update: TargetUpdate; previous: TargetUpdate | null } | null> {
  const updates = await listTargetUpdates()
  const index = updates.findIndex((u) => u.effectiveDate === effectiveDate)
  const update = updates[index]
  if (!update) return null
  return { update, previous: updates[index + 1] ?? null }
}

/** symbol → the categories it appears in on the latest update (the categories members filter by). */
export async function categoriesBySymbol(): Promise<Map<string, string[]>> {
  const latest = await latestTargetUpdate()
  const map = new Map<string, string[]>()
  for (const e of latest?.entries ?? []) map.set(e.symbol, [...(map.get(e.symbol) ?? []), e.group])
  return map
}

export function listWeeks(): Promise<{ weekStart: IsoDate; weekEnd: IsoDate }[]> {
  return memo("tools:weeks", MINUTE, async () => {
    const snap = await adminDb()
      .collection(COLLECTIONS.weeks)
      .orderBy("weekStart", "desc")
      .limit(104)
      .select("weekStart", "weekEnd")
      .get()
    return snap.docs.map((d) => ({ weekStart: d.get("weekStart") as IsoDate, weekEnd: d.get("weekEnd") as IsoDate }))
  })
}

export function getWeek(weekStart: string): Promise<WeekDoc | null> {
  return memo(`tools:week:${weekStart}`, MINUTE, async () => {
    const snap = await adminDb().collection(COLLECTIONS.weeks).doc(weekStart).get()
    return snap.exists ? parseDoc(weekSchema, snap.id, snap.data()) : null
  })
}

/** The requested week, else the last completed week, else the newest week on file. */
export async function resolveWeek(
  requested: string | null,
): Promise<{ week: WeekDoc | null; previous: WeekDoc | null; weeks: { weekStart: IsoDate; weekEnd: IsoDate }[] }> {
  const weeks = await listWeeks()
  const preferred = requested ?? lastCompletedWeek(todayInMarketZone()).start
  const chosen = weeks.find((w) => w.weekStart === preferred) ?? weeks[0]
  if (!chosen) return { week: null, previous: null, weeks }
  const index = weeks.indexOf(chosen)
  const previousStart = weeks[index + 1]?.weekStart
  const [week, previous] = await Promise.all([
    getWeek(chosen.weekStart),
    previousStart ? getWeek(previousStart) : Promise.resolve(null),
  ])
  return { week, previous, weeks }
}

export function getTickerBars(symbol: string): Promise<TickerBars | null> {
  return memo(`tools:bars:${symbol}`, 5 * MINUTE, async () => {
    const snap = await adminDb().collection(COLLECTIONS.tickerBars).doc(symbol).get()
    return snap.exists ? parseDoc(tickerBarsSchema, snap.id, snap.data()) : null
  })
}

export const getStanding = cache(async (): Promise<StandingDoc | null> => {
  const snap = await adminDb().collection(COLLECTIONS.standing).doc(STANDING_DOC).get()
  return snap.exists ? parseDoc(standingSchema, snap.id, snap.data()) : null
})
