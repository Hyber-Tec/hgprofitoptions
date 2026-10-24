"use server"

import { randomUUID } from "node:crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { signedRange, svi } from "@/core/calc/kmd"
import { addDays, isIsoDate, zonedDateTime } from "@/core/dates"
import type { ActionResult, IsoDate } from "@/core/domain/types"
import { EARNINGS_TIMINGS } from "@/core/earnings"
import { INDEX_NAMES, isIndexSymbol } from "@/core/indices"
import { MARKET_SYNC_DOC, runRequestedSync } from "@/server/market/jobs"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, type IndexWeekRow } from "@/server/model"
import { addTicker } from "@/server/tickers"
import { editorForAction } from "@/lib/auth/guards"
import { invalidate } from "@/lib/data/cache"
import { marketDataConfig } from "@/lib/env.server"
import { adminDb } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins and data editors only. If you are one, sign in again with two-step verification.",
} as const
const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z.]{0,5}$/, "Use a ticker like TSM")

const levelList = z.array(z.number().positive()).max(12)

const tickerInput = z
  .object({
    name: z.string().trim().max(80).nullable(),
    active: z.boolean(),
    channelSize: z.number().positive().nullable(),
    bocSize: z.number().positive().nullable(),
    fsLevels: levelList,
    ssLevels: levelList,
    earningsStart: z.string().nullable(),
    earningsEnd: z.string().nullable(),
    earningsTiming: z.enum(EARNINGS_TIMINGS).nullable(),
    notes: z.string().max(4000).nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.channelSize === null) !== (v.bocSize === null))
      ctx.addIssue({ code: "custom", path: ["bocSize"], message: "Set both CH and BOC, or neither" })
    if (v.earningsStart && !isIsoDate(v.earningsStart))
      ctx.addIssue({ code: "custom", path: ["earningsStart"], message: "Invalid date" })
    if (v.earningsEnd && !isIsoDate(v.earningsEnd))
      ctx.addIssue({ code: "custom", path: ["earningsEnd"], message: "Invalid date" })
    if (v.earningsStart && v.earningsEnd && v.earningsEnd < v.earningsStart)
      ctx.addIssue({ code: "custom", path: ["earningsEnd"], message: "Ends before it starts" })
  })

export type TickerInput = z.input<typeof tickerInput>

export async function updateTicker(rawSymbol: string, input: TickerInput): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const sym = symbol.safeParse(rawSymbol)
  const parsed = tickerInput.safeParse(input)
  if (!sym.success || !parsed.success)
    return {
      ok: false,
      code: "validation",
      message: parsed.success ? "Invalid ticker." : (parsed.error.issues[0]?.message ?? "Check the fields."),
    }
  const ref = adminDb().collection(COLLECTIONS.tickers).doc(sym.data)
  if (!(await ref.get()).exists) return { ok: false, code: "not-found", message: "This ticker no longer exists." }
  await ref.update({
    ...parsed.data,
    earningsStart: parsed.data.earningsStart || null,
    earningsEnd: parsed.data.earningsEnd || parsed.data.earningsStart || null,
    // A time of day only fits a known day, not a window.
    earningsTiming:
      parsed.data.earningsStart && (!parsed.data.earningsEnd || parsed.data.earningsEnd === parsed.data.earningsStart)
        ? parsed.data.earningsTiming
        : null,
    updatedAt: Timestamp.now(),
    updatedBy: viewer.uid,
  })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "ticker.updated",
    targetType: "ticker",
    targetId: sym.data,
  })
  invalidate("tools:")
  refresh()
  return { ok: true, data: undefined }
}

/**
 * Adds a ticker from its symbol alone. With market data connected, its name and kind come from the
 * provider and about 18 months of prices are fetched at once, so it shows up in Key Market Data and the
 * Median & Channel Chart right away. BOC starts at half the channel (HG's usual setting).
 */
export async function createTicker(input: {
  symbol: string
  channelSize: number | null
}): Promise<ActionResult<{ name: string | null; bars: number; addedToWeek: string | null; priced: boolean }>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const sym = symbol.safeParse(input.symbol)
  if (!sym.success) return { ok: false, code: "validation", message: "Use a ticker like TSM." }
  const channel = z.number().positive().nullable().safeParse(input.channelSize)
  if (!channel.success) return { ok: false, code: "validation", message: "The channel must be a positive number." }
  const market = marketDataConfig()
  const result = await addTicker(adminDb(), market, sym.data, channel.data, viewer.uid)
  if (result.status === "exists") return { ok: false, code: "conflict", message: `${sym.data} is already in the list.` }
  if (result.status === "not-found")
    return { ok: false, code: "not-found", message: `${sym.data} was not found. Check the symbol and try again.` }
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "ticker.created",
    targetType: "ticker",
    targetId: sym.data,
    detail: { bars: result.bars },
  })
  invalidate("tools:")
  refresh()
  return {
    ok: true,
    data: { name: result.name, bars: result.bars, addedToWeek: result.addedToWeek, priced: market !== null },
  }
}

const etfInput = z.object({
  guidance: z.array(z.string().trim().min(1).max(1000)).max(10),
  pairs: z
    .array(
      z.object({
        underlying: symbol,
        etf: symbol,
        leverage: z.number().min(1).max(5),
        direction: z.enum(["bull", "bear"]),
        issuer: z.string().trim().max(60).nullable(),
      }),
    )
    .max(100),
})

export async function updateEtfConfig(input: z.input<typeof etfInput>): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = etfInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the pairs." }
  const batch = adminDb().batch()
  batch.set(adminDb().collection(COLLECTIONS.config).doc("leveragedEtfs"), {
    ...parsed.data,
    pairs: parsed.data.pairs.map((p) => ({ ...p, issuer: p.issuer || null })),
    updatedAt: Timestamp.now(),
  })
  for (const p of parsed.data.pairs)
    batch.set(
      adminDb().collection(COLLECTIONS.tickers).doc(p.etf),
      { symbol: p.etf, kind: "etf", active: true, updatedAt: Timestamp.now() },
      { merge: true },
    )
  await batch.commit()
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "etfs.updated",
    targetType: "config",
    targetId: "leveragedEtfs",
    detail: { pairs: parsed.data.pairs.length },
  })
  invalidate("tools:")
  refresh()
  return { ok: true, data: undefined }
}

const indexRow = z.object({
  pfcp: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  /** "2026-10-21T12:30", New York time (a datetime-local field). */
  highAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  lowAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
})
export type IndexValuesInput = z.input<typeof indexRow>

/** A New York wall-clock time from a datetime-local field, as an ISO instant. */
const instant = (local: string | null) =>
  local ? zonedDateTime(local.slice(0, 10) as IsoDate, local.slice(11, 16)).toISOString() : null

/**
 * HG's weekly close of the indexes, typed in: it wins over market data for that week (which is how the
 * indexes are kept when the market data plan does not include them).
 */
export async function saveIndexValues(
  weekStart: string,
  values: Partial<Record<string, IndexValuesInput>>,
): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  if (!isIsoDate(weekStart)) return { ok: false, code: "validation", message: "Pick the week." }
  const rows: Record<string, IndexWeekRow> = {}
  for (const [sym, raw] of Object.entries(values)) {
    if (!isIndexSymbol(sym)) continue
    const parsed = indexRow.safeParse(raw)
    if (!parsed.success)
      return {
        ok: false,
        code: "validation",
        message: `${INDEX_NAMES[sym]}: enter the close, last Friday's close, the high and the low.`,
      }
    const v = parsed.data
    if (v.low > v.high)
      return { ok: false, code: "validation", message: `${INDEX_NAMES[sym]}: the low is above the high.` }
    const range = signedRange(v.pfcp, v.high, v.low, v.close)
    rows[sym] = {
      pfcp: v.pfcp,
      high: v.high,
      low: v.low,
      close: v.close,
      range,
      svi: svi(range, v.close),
      highAt: instant(v.highAt),
      lowAt: instant(v.lowAt),
      entered: true,
    }
  }
  if (Object.keys(rows).length === 0)
    return {
      ok: false,
      code: "validation",
      message: "Fill in at least one index: close, last Friday's close, high and low.",
    }
  const ref = adminDb().collection(COLLECTIONS.weeks).doc(weekStart)
  const snap = await ref.get()
  if (snap.exists) await ref.set({ indices: rows }, { merge: true })
  else
    await ref.set({
      weekStart,
      weekEnd: addDays(weekStart, 4),
      rows: {},
      indices: rows,
      source: "manual",
      computedAt: Timestamp.now(),
    })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "market.index_values",
    targetType: "week",
    targetId: weekStart,
    detail: { indexes: Object.keys(rows) },
  })
  invalidate("tools:")
  refresh()
  return { ok: true, data: undefined }
}

/** Removes the typed-in index values of a week, so market data fills them in at its next update. */
export async function clearIndexValues(weekStart: string): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  if (!isIsoDate(weekStart)) return { ok: false, code: "validation", message: "Pick the week." }
  const ref = adminDb().collection(COLLECTIONS.weeks).doc(weekStart)
  const snap = await ref.get()
  const indices = (snap.get("indices") ?? {}) as Record<string, { entered?: boolean }>
  const typed = Object.keys(indices).filter((sym) => indices[sym]?.entered === true)
  if (typed.length > 0)
    await ref.update(Object.fromEntries(typed.map((sym) => [`indices.${sym}`, FieldValue.delete()])))
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "market.index_values_cleared",
    targetType: "week",
    targetId: weekStart,
    detail: { indexes: typed },
  })
  if (marketDataConfig()) await queueMarketSync(viewer.uid)
  invalidate("tools:")
  refresh()
  return { ok: true, data: undefined }
}

/** Starts a market data update now (the scheduled one runs after each close). */
export async function requestMarketSync(): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  if (!marketDataConfig())
    return { ok: false, code: "unavailable", message: "No market data provider is connected yet." }
  const ref = adminDb().collection(COLLECTIONS.config).doc(MARKET_SYNC_DOC)
  const status = (await ref.get()).get("status") as string | undefined
  if (status !== "pending" && status !== "running") await queueMarketSync(viewer.uid)
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "market.update_requested",
    targetType: "config",
    targetId: MARKET_SYNC_DOC,
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Queues an update: a Cloud Function picks it up (locally without one, the web server does it). */
async function queueMarketSync(uid: string): Promise<void> {
  await adminDb()
    .collection(COLLECTIONS.config)
    .doc(MARKET_SYNC_DOC)
    .set({ status: "pending", requestedAt: Timestamp.now(), requestedBy: uid, message: null, finishedAt: null })
  if (process.env.DELIVER_ALERTS_INLINE === "true")
    after(async () => {
      await runRequestedSync(adminDb(), marketDataConfig(), `inline-${randomUUID()}`)
      invalidate("tools:")
    })
}
