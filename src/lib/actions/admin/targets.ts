"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { publishTargets, updateTitle } from "@/server/targets"
import { COLLECTIONS } from "@/server/model"
import { notifyTargetsPublished } from "@/server/notifications"
import { adminForAction } from "@/lib/auth/guards"
import { invalidate } from "@/lib/data/cache"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const

const entry = z.object({
  group: z.string().min(1).max(80),
  position: z.number().int().min(1),
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z.]{0,5}$/),
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
  const viewer = await adminForAction()
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
  const viewer = await adminForAction()
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
  if (input.notify && process.env.DELIVER_ALERTS_INLINE === "true") {
    after(async () => {
      try {
        await notifyTargetsPublished(adminDb(), adminMessaging(), parsed.data.effectiveDate, revision)
      } catch (error) {
        console.error("notifyTargetsPublished", error)
      }
    })
  }
  refresh()
  return { ok: true, data: { revision } }
}

export async function deleteTargetDraft(draftId: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const ref = adminDb().collection(COLLECTIONS.targetUpdates).doc(draftId)
  const snap = await ref.get()
  if (!snap.exists || snap.get("status") !== "draft")
    return { ok: false, code: "not-found", message: "This draft no longer exists." }
  await ref.delete()
  refresh()
  return { ok: true, data: undefined }
}
