"use server"

import { randomUUID } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { mapLimit } from "@/core/async"
import { isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { fetchTickerDetails } from "@/server/market/provider"
import { writeAudit } from "@/server/members"
import { COLLECTIONS } from "@/server/model"
import { notifyTargetsOnce } from "@/server/notifications"
import { publishTargets, updateTitle } from "@/server/targets"
import { addTicker } from "@/server/tickers"
import { editorForAction } from "@/lib/auth/guards"
import { invalidate } from "@/lib/data/cache"
import { marketDataConfig } from "@/lib/env.server"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins and data editors only. If you are one, sign in again with two-step verification.",
} as const

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z.]{0,5}$/)

const entry = z.object({
  group: z.string().min(1).max(80),
  position: z.number().int().min(1),
  symbol,
  target: z.number().positive(),
  breakLevel: z.number().positive(),
  putStrike: z.number().positive(),
  expiry: z.string().refine(isIsoDate),
  dowWeight: z.number().positive().nullable(),
  note: z.string().max(200).nullable(),
})

const updateInput = z.object({
  effectiveDate: z.string().refine(isIsoDate, "Pick the date of this update"),
  entries: z.array(entry).min(1, "Add at least one ticker").max(400),
  sourceText: z.string().max(100_000).nullable(),
  groups: z.array(z.object({ slug: z.string().min(1).max(80), name: z.string().min(1).max(80) })).max(40),
})

export type TargetUpdateInput = z.input<typeof updateInput>

function duplicateSymbols(entries: { symbol: string }[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const e of entries) {
    const s = e.symbol.toUpperCase()
    if (seen.has(s)) dupes.add(s)
    seen.add(s)
  }
  return [...dupes]
}

export async function saveTargetDraft(
  input: TargetUpdateInput,
  draftId: string | null,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = updateInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Some rows are incomplete." }
  const ref = draftId
    ? adminDb().collection(COLLECTIONS.targetUpdates).doc(draftId)
    : adminDb().collection(COLLECTIONS.targetUpdates).doc()
  if (draftId) {
    const snap = await ref.get()
    if (!snap.exists || snap.get("status") !== "draft")
      return { ok: false, code: "conflict", message: "This draft no longer exists." }
  }
  const now = Timestamp.now()
  await ref.set(
    {
      effectiveDate: parsed.data.effectiveDate,
      title: updateTitle(parsed.data.effectiveDate),
      status: "draft",
      entries: parsed.data.entries,
      sourceText: parsed.data.sourceText,
      groups: parsed.data.groups,
      changeNote: null,
      revisionOf: null,
      revision: 0,
      publishedAt: null,
      publishedBy: null,
      createdAt: now,
      createdBy: viewer.uid,
    },
    { merge: true },
  )
  refresh()
  return { ok: true, data: { id: ref.id } }
}

export async function publishTargetUpdate(
  input: TargetUpdateInput & { changeNote: string | null; notify: boolean },
  draftId: string | null,
): Promise<ActionResult<{ revision: number }>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = updateInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Some rows are incomplete." }
  const dupes = duplicateSymbols(parsed.data.entries)
  if (dupes.length > 0)
    return {
      ok: false,
      code: "validation",
      message: `${dupes.join(", ")} appear${dupes.length === 1 ? "s" : ""} more than once.`,
    }
  const { revision } = await publishTargets(
    adminDb(),
    {
      effectiveDate: parsed.data.effectiveDate,
      entries: parsed.data.entries.map((e) => ({ ...e, expiry: e.expiry })),
      sourceText: parsed.data.sourceText,
      changeNote: input.changeNote?.trim() || null,
      groups: parsed.data.groups,
      notify: input.notify,
    },
    { uid: viewer.uid, email: viewer.email },
  )
  if (draftId) await adminDb().collection(COLLECTIONS.targetUpdates).doc(draftId).delete()
  invalidate("tools:")
  // Stocks new to the list are added with their name and prices, after the reply so publishing stays quick.
  const symbols = [...new Set(parsed.data.entries.map((e) => e.symbol))]
  after(async () => {
    try {
      const db = adminDb()
      const existing = await db.getAll(...symbols.map((s) => db.collection(COLLECTIONS.tickers).doc(s)))
      const missing = symbols.filter((_, i) => !existing[i]?.exists)
      const market = marketDataConfig()
      for (const s of missing) {
        const result = await addTicker(db, market, s, null, viewer.uid)
        if (result.status !== "added") continue
        await writeAudit(db, {
          actorUid: viewer.uid,
          actorEmail: viewer.email,
          action: "ticker.created",
          targetType: "ticker",
          targetId: s,
          detail: { bars: result.bars, from: "strike targets" },
        })
      }
      if (missing.length > 0) invalidate("tools:")
    } catch (error) {
      console.error("Adding new tickers from strike targets:", error)
    }
  })
  if (input.notify && process.env.DELIVER_ALERTS_INLINE === "true") {
    after(async () => {
      try {
        await notifyTargetsOnce(adminDb(), adminMessaging(), parsed.data.effectiveDate, `inline-${randomUUID()}`)
      } catch (error) {
        console.error("notifyTargetsPublished", error)
      }
    })
  }
  refresh()
  return { ok: true, data: { revision } }
}

export interface SymbolLookup {
  symbol: string
  /** The company, when the market data provider knows the symbol. */
  name: string | null
  /** False when the provider says there is no such symbol, which is most likely a typo. */
  found: boolean
}

/**
 * What the market data provider knows about symbols that are not in the ticker list yet, so the editor can
 * show their names and catch a typo before publishing. Null when market data is not connected.
 */
export async function lookUpSymbols(symbols: string[]): Promise<ActionResult<SymbolLookup[] | null>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const list = z.array(symbol).max(200).safeParse(symbols)
  if (!list.success) return { ok: false, code: "validation", message: "Some tickers were not valid." }
  const market = marketDataConfig()
  if (!market) return { ok: true, data: null }
  const data = await mapLimit([...new Set(list.data)], 4, async (s): Promise<SymbolLookup> => {
    try {
      const details = await fetchTickerDetails(market, s)
      return { symbol: s, name: details?.name ?? null, found: details !== null }
    } catch {
      // A failed lookup says nothing about the symbol, so it is not flagged.
      return { symbol: s, name: null, found: true }
    }
  })
  return { ok: true, data }
}

export async function deleteTargetDraft(draftId: string): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const ref = adminDb().collection(COLLECTIONS.targetUpdates).doc(draftId)
  const snap = await ref.get()
  if (!snap.exists || snap.get("status") !== "draft")
    return { ok: false, code: "not-found", message: "This draft no longer exists." }
  await ref.delete()
  refresh()
  return { ok: true, data: undefined }
}
