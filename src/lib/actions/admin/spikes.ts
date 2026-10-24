"use server"

import { randomUUID } from "node:crypto"
import { FieldValue } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { tradingDaysAfter } from "@/core/holidays"
import { defaultSpikeTitle, parseSpikeList, spikeDirection } from "@/core/spikes"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, isDocId, parseDoc, spikeSchema } from "@/server/model"
import { notifySpikesOnce } from "@/server/notifications"
import { postSpikes } from "@/server/spikes"
import { editorForAction, type Viewer } from "@/lib/auth/guards"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins and data editors only. If you are one, sign in again with two-step verification.",
} as const

const audit = (viewer: Viewer, action: string, id: string, detail?: Record<string, unknown>) =>
  writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action,
    targetType: "spike",
    targetId: id,
    ...(detail ? { detail } : {}),
  })

/** A Cloud Function tells members; locally without one (DELIVER_ALERTS_INLINE=true), the web server does. */
function notifyLater(postId: string) {
  if (process.env.DELIVER_ALERTS_INLINE !== "true") return
  after(async () => {
    try {
      await notifySpikesOnce(adminDb(), adminMessaging(), postId, `inline-${randomUUID()}`)
    } catch (error) {
      console.error("notifySpikesOnce", error)
    }
  })
}

const date = z.string().refine(isIsoDate, "Pick a date")

const listInput = z.object({
  title: z.string().trim().max(120),
  text: z.string().max(40_000),
  date,
  at: z.enum(["open", "close"]),
  notify: z.boolean(),
})

/**
 * Posts a pasted spike list. Lines that cannot be read are left out (the preview shows them); a list
 * with no readable line is refused.
 */
export async function postSpikeList(input: z.input<typeof listInput>): Promise<ActionResult<{ count: number }>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = listInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const v = parsed.data
  const { rows } = parseSpikeList(v.text, { date: v.date, at: v.at })
  if (rows.length === 0)
    return { ok: false, code: "validation", message: "Paste at least one line with a ticker and its spike price." }
  if (rows.length > 200) return { ok: false, code: "validation", message: "Post at most 200 spikes at a time." }
  const title = v.title || defaultSpikeTitle(v.date)
  const postId = await postSpikes(adminDb(), { title, rows, notify: v.notify, actorUid: viewer.uid })
  await audit(viewer, "spike.posted", postId, { count: rows.length })
  if (v.notify) notifyLater(postId)
  refresh()
  return { ok: true, data: { count: rows.length } }
}

const spikeInput = z.object({
  id: z.string().refine(isDocId),
  price: z.number().positive().max(1_000_000),
  close: z.number().positive().max(1_000_000).nullable(),
  date,
  at: z.enum(["open", "close", "time"]),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 16:20")
    .nullable(),
  /** The session it traded back to the spike price, set by hand (the daily market data sets it by itself). */
  recoveredOn: date.nullable(),
})

/** Corrects one spike: its price, close, when it happened, or when it was reached again. */
export async function updateSpike(input: z.input<typeof spikeInput>): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = spikeInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const v = parsed.data
  if (v.at === "time" && !v.time) return { ok: false, code: "validation", message: "Add the time of the spike." }
  if (v.recoveredOn !== null && v.recoveredOn <= v.date)
    return { ok: false, code: "validation", message: "It can only be reached again after the spike's day." }
  const ref = adminDb().collection(COLLECTIONS.spikes).doc(v.id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, code: "not-found", message: "This spike no longer exists." }
  await ref.update({
    price: v.price,
    close: v.close,
    date: v.date,
    at: v.at,
    time: v.at === "open" ? null : v.time,
    direction: spikeDirection(v.price, v.close),
    recoveredOn: v.recoveredOn,
    sessionsToRecover: v.recoveredOn ? tradingDaysAfter(v.date, v.recoveredOn).length : null,
  })
  await audit(viewer, "spike.edited", v.id, { symbol: snap.get("symbol") as string })
  refresh()
  return { ok: true, data: undefined }
}

/** Removes one stock from a spike list. */
export async function deleteSpike(id: string): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  if (!isDocId(id)) return { ok: false, code: "validation", message: "Invalid spike." }
  const ref = adminDb().collection(COLLECTIONS.spikes).doc(id)
  const snap = await ref.get()
  const spike = snap.exists ? parseDoc(spikeSchema, snap.id, snap.data()) : null
  if (!spike) return { ok: true, data: undefined }
  const post = adminDb().collection(COLLECTIONS.spikePosts).doc(spike.postId)
  const rest = await adminDb().collection(COLLECTIONS.spikes).where("postId", "==", spike.postId).count().get()
  const batch = adminDb().batch()
  batch.delete(ref)
  // The list goes with its last spike.
  if (rest.data().count <= 1) batch.delete(post)
  else batch.update(post, { count: FieldValue.increment(-1) })
  await batch.commit()
  await audit(viewer, "spike.deleted", id, { symbol: spike.symbol })
  refresh()
  return { ok: true, data: undefined }
}

/** Removes a whole spike list. */
export async function deleteSpikeList(postId: string): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  if (!isDocId(postId)) return { ok: false, code: "validation", message: "Invalid spike list." }
  const spikes = await adminDb().collection(COLLECTIONS.spikes).where("postId", "==", postId).get()
  const writer = adminDb().bulkWriter()
  for (const doc of spikes.docs) void writer.delete(doc.ref)
  void writer.delete(adminDb().collection(COLLECTIONS.spikePosts).doc(postId))
  await writer.close()
  await audit(viewer, "spike.list_deleted", postId, { count: spikes.size })
  refresh()
  return { ok: true, data: undefined }
}
