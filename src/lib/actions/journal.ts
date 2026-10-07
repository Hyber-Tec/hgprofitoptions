"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { instrumentKey } from "@/core/calc/trades"
import { isIsoDate, todayInMarketZone } from "@/core/dates"
import type { ActionResult, Fill, Instrument, IsoDate } from "@/core/domain/types"
import { parseTradesCsv } from "@/core/parsers/trades-csv"
import { buildTrades } from "@/core/calc/trades"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, tradeSchema, parseDoc, type TradeDoc } from "@/server/model"
import { computeMemberStats } from "@/server/portfolio"
import {
  EMPTY_JOURNAL,
  TradeShapeError,
  closedTradeFields,
  openTradeFields,
  tradeFieldsFromFills,
} from "@/server/trades"
import { getViewer, type Viewer } from "@/lib/auth/guards"
import { adminDb } from "@/lib/firebase/admin"

const unauthorized = {
  ok: false,
  code: "unauthorized",
  message: "Your session has ended. Please sign in again.",
} as const
const readOnly = {
  ok: false,
  code: "forbidden",
  message: "Your journal is read-only while your membership is not active.",
} as const

/** Journal writes need an active membership (inactive members keep read access and export). */
async function journalWriter(): Promise<Viewer | null> {
  const viewer = await getViewer()
  return viewer?.hasAccess ? viewer : null
}

const trades = (uid: string) =>
  adminDb().collection(COLLECTIONS.members).doc(uid).collection(MEMBER_SUBCOLLECTIONS.trades)

function recomputeLater(uid: string) {
  after(async () => {
    try {
      await computeMemberStats(adminDb(), uid, todayInMarketZone())
    } catch (error) {
      console.error("computeMemberStats", error)
    }
  })
}

async function readTrade(uid: string, id: string): Promise<TradeDoc | null> {
  const snap = await trades(uid).doc(id).get()
  return snap.exists ? parseDoc(tradeSchema, snap.id, snap.data()) : null
}

// ---- Journal fields ---------------------------------------------------------------------------

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .nullable()

const journalInput = z.object({
  setup: text(80),
  thesis: text(4000),
  plan: text(4000),
  outcome: text(4000),
  lesson: text(4000),
  emotions: z.array(z.string().max(40)).max(12),
  rating: z.number().int().min(1).max(5).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  alertId: z.string().max(128).nullable(),
})

export type JournalInput = z.input<typeof journalInput>

export async function saveTradeJournal(tradeId: string, input: JournalInput): Promise<ActionResult> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  const parsed = journalInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message: "Some journal fields are too long or invalid.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  const trade = await readTrade(viewer.uid, tradeId)
  if (!trade) return { ok: false, code: "not-found", message: "This trade no longer exists." }
  const tags = [...new Set(parsed.data.tags.map((t) => t.toLowerCase()))]
  await trades(viewer.uid)
    .doc(tradeId)
    .update({ ...parsed.data, tags, updatedAt: Timestamp.now() })
  recomputeLater(viewer.uid)
  refresh()
  return { ok: true, data: undefined }
}

// ---- Manual trades ----------------------------------------------------------------------------

const manualInput = z
  .object({
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z.]{0,5}$/, "Use a ticker like TSM"),
    assetType: z.enum(["stock", "option"]),
    optionRight: z.enum(["call", "put"]).nullable(),
    strike: z.number().positive().nullable(),
    expiry: z.string().nullable(),
    direction: z.enum(["long", "short"]),
    quantity: z.number().positive().max(1_000_000),
    entryPrice: z.number().min(0).max(1_000_000),
    openedAt: z.iso.datetime(),
    fees: z.number().min(0).max(100_000),
    exitPrice: z.number().min(0).max(1_000_000).nullable(),
    closedAt: z.iso.datetime().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.assetType === "option") {
      if (!v.optionRight) ctx.addIssue({ code: "custom", path: ["optionRight"], message: "Choose call or put" })
      if (v.strike === null) ctx.addIssue({ code: "custom", path: ["strike"], message: "Enter the strike" })
      if (!v.expiry || !isIsoDate(v.expiry))
        ctx.addIssue({ code: "custom", path: ["expiry"], message: "Enter the expiry date" })
    }
    if ((v.exitPrice === null) !== (v.closedAt === null))
      ctx.addIssue({
        code: "custom",
        path: ["exitPrice"],
        message: "Enter both the exit price and the close date, or neither",
      })
    if (v.closedAt && v.closedAt < v.openedAt)
      ctx.addIssue({ code: "custom", path: ["closedAt"], message: "The close must be after the open" })
  })

export type ManualTradeInput = z.input<typeof manualInput>

export async function createManualTrade(input: ManualTradeInput): Promise<ActionResult<{ id: string }>> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  const parsed = manualInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  const v = parsed.data
  const instrument: Instrument =
    v.assetType === "option" && v.optionRight && v.strike !== null && v.expiry
      ? { assetType: "option", symbol: v.symbol, right: v.optionRight, strike: v.strike, expiry: v.expiry as IsoDate }
      : { assetType: "stock", symbol: v.symbol }
  const ref = trades(viewer.uid).doc()
  const open = v.direction === "long" ? "buy" : "sell"
  const fills: Fill[] = [
    {
      id: `${ref.id}-1`,
      accountId: "manual",
      instrument,
      side: open,
      quantity: v.quantity,
      price: v.entryPrice,
      fees: v.fees,
      executedAt: v.openedAt,
    },
  ]
  if (v.exitPrice !== null && v.closedAt)
    fills.push({
      id: `${ref.id}-2`,
      accountId: "manual",
      instrument,
      side: open === "buy" ? "sell" : "buy",
      quantity: v.quantity,
      price: v.exitPrice,
      fees: 0,
      executedAt: v.closedAt,
    })
  const now = Timestamp.now()
  await ref.set({ source: "manual", ...tradeFieldsFromFills(fills), ...EMPTY_JOURNAL, createdAt: now, updatedAt: now })
  recomputeLater(viewer.uid)
  return { ok: true, data: { id: ref.id } }
}

const closeInput = z.object({
  price: z.number().min(0).max(1_000_000),
  quantity: z.number().positive(),
  closedAt: z.iso.datetime(),
  fees: z.number().min(0).max(100_000),
})

/** Adds a closing fill to a manual or imported trade (all of it, or part). */
export async function closeManualTrade(tradeId: string, input: z.input<typeof closeInput>): Promise<ActionResult> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  const parsed = closeInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Enter a price, quantity and date." }
  const trade = await readTrade(viewer.uid, tradeId)
  if (!trade) return { ok: false, code: "not-found", message: "This trade no longer exists." }
  if (trade.source === "broker")
    return { ok: false, code: "forbidden", message: "Brokerage trades close automatically when your broker syncs." }
  if (trade.status !== "open") return { ok: false, code: "conflict", message: "This trade is already closed." }
  if (parsed.data.quantity > trade.quantity)
    return { ok: false, code: "validation", message: `You can close at most ${trade.quantity}.` }
  const instrument: Instrument =
    trade.assetType === "option" && trade.optionRight && trade.strike !== null && trade.expiry
      ? {
          assetType: "option",
          symbol: trade.symbol,
          right: trade.optionRight,
          strike: trade.strike,
          expiry: trade.expiry,
        }
      : { assetType: "stock", symbol: trade.symbol }
  const existing: Fill[] = trade.fills.map((f) => ({ ...f, accountId: "manual", instrument }))
  const closing: Fill = {
    id: `${tradeId}-${existing.length + 1}`,
    accountId: "manual",
    instrument,
    side: trade.direction === "long" ? "sell" : "buy",
    quantity: parsed.data.quantity,
    price: parsed.data.price,
    fees: parsed.data.fees,
    executedAt: parsed.data.closedAt,
  }
  try {
    await trades(viewer.uid)
      .doc(tradeId)
      .update({ ...tradeFieldsFromFills([...existing, closing]), updatedAt: Timestamp.now() })
  } catch (error) {
    if (error instanceof TradeShapeError) return { ok: false, code: "validation", message: error.message }
    throw error
  }
  recomputeLater(viewer.uid)
  refresh()
  return { ok: true, data: undefined }
}

export async function deleteManualTrade(tradeId: string): Promise<ActionResult> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  const trade = await readTrade(viewer.uid, tradeId)
  if (!trade) return { ok: false, code: "not-found", message: "This trade no longer exists." }
  if (trade.source === "broker")
    return { ok: false, code: "forbidden", message: "Brokerage trades cannot be deleted. Exclude the account instead." }
  await trades(viewer.uid).doc(tradeId).delete()
  await adminDb()
    .collection(COLLECTIONS.members)
    .doc(viewer.uid)
    .collection(MEMBER_SUBCOLLECTIONS.privateNotes)
    .doc(tradeId)
    .delete()
  recomputeLater(viewer.uid)
  return { ok: true, data: undefined }
}

// ---- Screenshots ------------------------------------------------------------------------------

const screenshotPath = (uid: string, tradeId: string) => new RegExp(`^journal/${uid}/${tradeId}/[\\w.-]{1,120}$`)

export async function setTradeScreenshots(tradeId: string, paths: string[]): Promise<ActionResult> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  if (paths.length > 8 || !paths.every((p) => screenshotPath(viewer.uid, tradeId).test(p)))
    return { ok: false, code: "validation", message: "Invalid screenshot." }
  const trade = await readTrade(viewer.uid, tradeId)
  if (!trade) return { ok: false, code: "not-found", message: "This trade no longer exists." }
  await trades(viewer.uid).doc(tradeId).update({ screenshots: paths, updatedAt: Timestamp.now() })
  refresh()
  return { ok: true, data: undefined }
}

// ---- Daily notes ------------------------------------------------------------------------------

export async function saveJournalDay(input: {
  date: string
  body: string
  mood: number | null
}): Promise<ActionResult> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  if (!isIsoDate(input.date) || input.date > todayInMarketZone())
    return { ok: false, code: "validation", message: "Pick a day that is not in the future." }
  if (input.body.length > 20000) return { ok: false, code: "validation", message: "This note is too long." }
  if (input.mood !== null && !(Number.isInteger(input.mood) && input.mood >= 1 && input.mood <= 5))
    return { ok: false, code: "validation", message: "Invalid mood." }
  const ref = adminDb()
    .collection(COLLECTIONS.members)
    .doc(viewer.uid)
    .collection(MEMBER_SUBCOLLECTIONS.journalDays)
    .doc(input.date)
  if (input.body.trim() === "" && input.mood === null) await ref.delete()
  else await ref.set({ date: input.date, body: input.body.trim(), mood: input.mood, updatedAt: Timestamp.now() })
  refresh()
  return { ok: true, data: undefined }
}

// ---- CSV import -------------------------------------------------------------------------------

export interface ImportPreview {
  format: "webull" | "template"
  fills: number
  skipped: number
  closed: number
  open: number
  duplicates: number
  realizedPnl: number
  issues: { line: number; message: string }[]
  sample: { label: string; status: "open" | "closed"; realizedPnl: number | null }[]
}

const MAX_CSV_BYTES = 2 * 1024 * 1024

/**
 * Two steps: `commit: false` parses and previews, `commit: true` writes the trades.
 * Fills already imported (same row) are skipped, so re-importing a file is safe.
 */
export async function importTradesCsv(input: { csv: string; commit: boolean }): Promise<ActionResult<ImportPreview>> {
  const viewer = await journalWriter()
  if (!viewer) return (await getViewer()) ? readOnly : unauthorized
  if (input.csv.length > MAX_CSV_BYTES)
    return { ok: false, code: "validation", message: "The file is larger than 2 MB. Export a shorter date range." }
  const parsed = parseTradesCsv(input.csv)
  if (parsed.fills.length === 0)
    return {
      ok: false,
      code: "validation",
      message: parsed.issues[0]?.message ?? "No filled trades were found in this file.",
    }

  const existing = await trades(viewer.uid).where("source", "==", "csv").get()
  const seen = new Set(
    existing.docs.flatMap((d) => ((d.get("fills") as { id: string }[] | undefined) ?? []).map((f) => f.id)),
  )
  const fresh = parsed.fills.filter((f) => !seen.has(f.id))
  const byId = new Map(fresh.map((f) => [f.id, f]))
  const { closed, open } = buildTrades(fresh)
  const preview: ImportPreview = {
    format: parsed.format,
    fills: parsed.fills.length,
    skipped: parsed.skipped,
    closed: closed.length,
    open: open.length,
    duplicates: parsed.fills.length - fresh.length,
    realizedPnl: Math.round(closed.reduce((s, t) => s + t.realizedPnl, 0) * 100) / 100,
    issues: parsed.issues.slice(0, 50),
    sample: [
      ...closed.map((t) => ({
        label: instrumentKey(t.instrument),
        status: "closed" as const,
        realizedPnl: Math.round(t.realizedPnl * 100) / 100,
      })),
      ...open.map((p) => ({ label: instrumentKey(p.instrument), status: "open" as const, realizedPnl: null })),
    ].slice(0, 12),
  }
  if (!input.commit) return { ok: true, data: preview }

  const now = Timestamp.now()
  const writer = adminDb().bulkWriter()
  for (const t of closed)
    void writer.set(trades(viewer.uid).doc(), {
      source: "csv",
      ...closedTradeFields(t, byId),
      accountId: null,
      ...EMPTY_JOURNAL,
      createdAt: now,
      updatedAt: now,
    })
  for (const p of open)
    void writer.set(trades(viewer.uid).doc(), {
      source: "csv",
      ...openTradeFields(p, byId),
      accountId: null,
      ...EMPTY_JOURNAL,
      createdAt: now,
      updatedAt: now,
    })
  await writer.close()
  recomputeLater(viewer.uid)
  return { ok: true, data: preview }
}
