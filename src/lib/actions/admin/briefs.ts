"use server"

import { randomUUID } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { zonedDateTime } from "@/core/dates"
import type { ActionResult, IsoDate } from "@/core/domain/types"
import { AiError } from "@/server/ai"
import { writeBriefDraft } from "@/server/briefs"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, isDocId } from "@/server/model"
import { notifyBriefOnce } from "@/server/notifications"
import { editorForAction, type Viewer } from "@/lib/auth/guards"
import { aiConfig } from "@/lib/env.server"
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
    targetType: "brief",
    targetId: id,
    ...(detail ? { detail } : {}),
  })

/** A Cloud Function notifies members; locally without one (DELIVER_ALERTS_INLINE=true), the web server does. */
function notifyLater(id: string) {
  if (process.env.DELIVER_ALERTS_INLINE !== "true") return
  after(async () => {
    try {
      await notifyBriefOnce(adminDb(), adminMessaging(), id, `inline-${randomUUID()}`)
    } catch (error) {
      console.error("notifyBriefOnce", error)
    }
  })
}

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a day and time")

const briefInput = z
  .object({
    id: z.string().refine(isDocId).nullable(),
    title: z.string().trim().min(2, "Give the brief a title").max(120),
    body: z.string().trim().min(10, "Paste or write the brief").max(40_000),
    /** Publish now, at a set time (New York, "2026-10-23T09:40"), or keep it as a draft. */
    when: z.enum(["now", "later", "draft"]),
    publishAt: localTime.nullable(),
    notify: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.when === "later" && !v.publishAt)
      ctx.addIssue({ code: "custom", path: ["publishAt"], message: "Pick when it goes out" })
  })

/** Posts a market brief (pasted in or written here), schedules it, or saves it as a draft. */
export async function saveBrief(input: z.input<typeof briefInput>): Promise<ActionResult<{ id: string }>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = briefInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const v = parsed.data
  const now = Timestamp.now()
  const publishAt =
    v.when === "later" && v.publishAt
      ? Timestamp.fromDate(zonedDateTime(v.publishAt.slice(0, 10) as IsoDate, v.publishAt.slice(11, 16)))
      : null
  if (publishAt && publishAt.toMillis() <= Date.now())
    return { ok: false, code: "validation", message: "Pick a time that has not passed yet, or post it now." }

  const ref = v.id ? adminDb().collection(COLLECTIONS.briefs).doc(v.id) : adminDb().collection(COLLECTIONS.briefs).doc()
  const existing = v.id ? await ref.get() : null
  if (v.id && !existing?.exists) return { ok: false, code: "not-found", message: "This brief no longer exists." }
  const wasPublished = existing?.get("status") === "published"
  if (wasPublished && v.when !== "now")
    return { ok: false, code: "validation", message: "This brief is already posted. Save your changes to it." }
  await ref.set(
    {
      title: v.title,
      body: v.body,
      status: v.when === "now" ? "published" : v.when === "later" ? "scheduled" : "draft",
      publishAt,
      // A correction keeps the time it was first posted.
      publishedAt: v.when === "now" ? ((existing?.get("publishedAt") as Timestamp | undefined) ?? now) : null,
      notify: v.notify,
      updatedAt: now,
      ...(existing ? {} : { source: "admin", notifiedAt: null, createdAt: now, createdBy: viewer.uid }),
    },
    { merge: true },
  )
  await audit(
    viewer,
    wasPublished
      ? "brief.edited"
      : v.when === "now"
        ? "brief.published"
        : v.when === "later"
          ? "brief.scheduled"
          : "brief.saved",
    ref.id,
  )
  if (v.when === "now" && !wasPublished) notifyLater(ref.id)
  refresh()
  return { ok: true, data: { id: ref.id } }
}

export async function deleteBrief(id: string): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  if (!isDocId(id)) return { ok: false, code: "validation", message: "Invalid brief." }
  await adminDb().collection(COLLECTIONS.briefs).doc(id).delete()
  await audit(viewer, "brief.deleted", id)
  refresh()
  return { ok: true, data: undefined }
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use times like 09:40")
const settingsInput = z.object({
  times: z.array(time).max(12),
  ai: z.object({ enabled: z.boolean(), instructions: z.string().trim().max(20_000) }),
})

/** The brief's times on market days, and whether the AI writes it then (with the team's instructions). */
export async function updateBriefSettings(input: z.input<typeof settingsInput>): Promise<ActionResult> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const parsed = settingsInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const { times, ai } = parsed.data
  if (ai.enabled && ai.instructions === "")
    return { ok: false, code: "validation", message: "Add the instructions the AI follows before switching it on." }
  if (ai.enabled && !aiConfig())
    return { ok: false, code: "unavailable", message: "AI is not set up on the server yet." }
  await adminDb()
    .collection(COLLECTIONS.settings)
    .doc("brief")
    .set({ times: [...new Set(times)].sort(), ai }, { merge: true })
  await audit(viewer, "brief.settings_updated", "brief", { times: times.length, ai: ai.enabled })
  refresh()
  return { ok: true, data: undefined }
}

/** The AI writes a draft now from these instructions, to try them before the schedule uses them. */
export async function tryBriefWithAi(instructions: string): Promise<ActionResult<{ id: string }>> {
  const viewer = await editorForAction()
  if (!viewer) return forbidden
  const ai = aiConfig()
  if (!ai) return { ok: false, code: "unavailable", message: "AI is not set up on the server yet." }
  const text = typeof instructions === "string" ? instructions.trim() : ""
  if (text === "") return { ok: false, code: "validation", message: "Add the instructions the AI follows first." }
  try {
    const id = await writeBriefDraft(adminDb(), ai, text.slice(0, 20_000), viewer.uid)
    await audit(viewer, "brief.ai_draft", id)
    refresh()
    return { ok: true, data: { id } }
  } catch (error) {
    if (error instanceof AiError) return { ok: false, code: "unavailable", message: error.message }
    throw error
  }
}
