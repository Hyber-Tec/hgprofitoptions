"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { z } from "zod"
import { signedRange, svi } from "@/core/calc/kmd"
import { addDays, isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { writeAudit } from "@/server/members"
import { COLLECTIONS } from "@/server/model"
import { adminForAction } from "@/lib/auth/guards"
import { invalidate } from "@/lib/data/cache"
import { adminDb } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
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
  const viewer = await adminForAction()
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

export async function createTicker(input: {
  symbol: string
  name: string | null
  kind: "stock" | "etf"
}): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const sym = symbol.safeParse(input.symbol)
  if (!sym.success) return { ok: false, code: "validation", message: "Use a ticker like TSM." }
  const ref = adminDb().collection(COLLECTIONS.tickers).doc(sym.data)
  if ((await ref.get()).exists) return { ok: false, code: "conflict", message: `${sym.data} is already in the list.` }
  await ref.set({
    symbol: sym.data,
    name: input.name?.trim() || null,
    kind: input.kind,
    active: true,
    channelSize: null,
    bocSize: null,
    fsLevels: [],
    ssLevels: [],
    earningsStart: null,
    earningsEnd: null,
    earningsNote: null,
    notes: null,
    categories: [],
    metrics: null,
    updatedAt: Timestamp.now(),
    updatedBy: viewer.uid,
  })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "ticker.created",
    targetType: "ticker",
    targetId: sym.data,
  })
  invalidate("tools:")
  refresh()
  return { ok: true, data: undefined }
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
  const viewer = await adminForAction()
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
})

/** Weekly index values (DJI, SPX, IXIC) entered by hand when index data is not licensed. */
export async function saveIndexValues(
  weekStart: string,
  values: Record<string, z.input<typeof indexRow>>,
): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (!isIsoDate(weekStart)) return { ok: false, code: "validation", message: "Pick the week." }
  const rows: Record<string, { pfcp: number; high: number; low: number; close: number; range: number; svi: number }> =
    {}
  for (const [sym, raw] of Object.entries(values)) {
    if (!["DJI", "SPX", "IXIC"].includes(sym)) continue
    const parsed = indexRow.safeParse(raw)
    if (!parsed.success)
      return { ok: false, code: "validation", message: `${sym}: enter the previous Friday close, high, low and close.` }
    if (parsed.data.low > parsed.data.high)
      return { ok: false, code: "validation", message: `${sym}: the low is above the high.` }
    const range = signedRange(parsed.data.pfcp, parsed.data.high, parsed.data.low, parsed.data.close)
    rows[sym] = { ...parsed.data, range, svi: svi(range, parsed.data.close) }
  }
  const ref = adminDb().collection(COLLECTIONS.weeks).doc(weekStart)
  const snap = await ref.get()
  if (snap.exists)
    await ref.update({ indices: { ...((snap.get("indices") as Record<string, unknown> | undefined) ?? {}), ...rows } })
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
  })
  invalidate("tools:")
  refresh()
  return { ok: true, data: undefined }
}
