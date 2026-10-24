"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { notifyRecapOnce } from "@/server/classes"
import { sendClassMaterial } from "@/server/notifications"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, classRecapSchema, isDocId, parseDoc, type ClassRecapDoc } from "@/server/model"
import { audienceInput } from "@/lib/audience"
import { adminForAction, type Viewer } from "@/lib/auth/guards"
import { queueRecap } from "@/lib/classes"
import { publicEnv } from "@/lib/env.public"
import { aiConfig, emailConfig } from "@/lib/env.server"
import { adminBucket, adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const
const missing = { ok: false, code: "not-found", message: "This recap no longer exists." } as const
const noAi = { ok: false, code: "unavailable", message: "AI is not set up on the server yet." } as const

const recaps = () => adminDb().collection(COLLECTIONS.classRecaps)

async function readRecap(id: string): Promise<ClassRecapDoc | null> {
  if (!isDocId(id)) return null
  const snap = await recaps().doc(id).get()
  return snap.exists ? parseDoc(classRecapSchema, snap.id, snap.data()) : null
}

function audit(viewer: Viewer, action: string, recapId: string, detail?: Record<string, unknown>) {
  return writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action,
    targetType: "recap",
    targetId: recapId,
    detail,
  })
}

const working = (recap: ClassRecapDoc) => recap.transcript.status === "pending" || recap.transcript.status === "running"

const title = z.string().trim().min(2, "Give the class a title").max(120)
const date = z.string().refine(isIsoDate, "Pick the date of the class")

const fileInput = z.object({
  path: z.string().startsWith("content/").max(512),
  name: z.string().trim().min(1).max(200),
  contentType: z.string().max(200).nullable(),
})

const createInput = z.object({ title, date, file: fileInput })

/** A recap from a transcript an admin uploaded: the AI writes it right away. */
export async function createRecap(input: z.input<typeof createInput>): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (!aiConfig()) return noAi
  const parsed = createInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const { file } = parsed.data
  const now = Timestamp.now()
  const ref = recaps().doc()
  await ref.set({
    title: parsed.data.title,
    date: parsed.data.date,
    zoomMeetingUuid: null,
    transcript: {
      status: "pending",
      source: "upload",
      path: file.path,
      name: file.name,
      contentType: file.contentType,
      downloadUrls: [],
      downloadToken: null,
      message: null,
      claimId: null,
      requestedAt: now,
      finishedAt: null,
    },
    summary: null,
    published: false,
    notifiedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await audit(viewer, "recap.created", ref.id, { date: parsed.data.date })
  queueRecap(ref.id)
  refresh()
  return { ok: true, data: { id: ref.id } }
}

/** Has the AI write the recap again from the same transcript (after a failure, or to start over). */
export async function rewriteRecap(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (!aiConfig()) return noAi
  const recap = await readRecap(id)
  if (!recap) return missing
  if (working(recap)) return { ok: false, code: "conflict", message: "The AI is already writing this recap." }
  if (!recap.transcript.path && recap.transcript.downloadUrls.length === 0)
    return { ok: false, code: "validation", message: "This recap has no transcript to read." }
  await recaps().doc(recap.id).update({
    "transcript.status": "pending",
    "transcript.message": null,
    "transcript.claimId": null,
    "transcript.requestedAt": Timestamp.now(),
    "transcript.finishedAt": null,
    updatedAt: Timestamp.now(),
  })
  await audit(viewer, "recap.rewritten", recap.id)
  queueRecap(recap.id)
  refresh()
  return { ok: true, data: undefined }
}

/** Gives a recap a transcript an admin uploaded (when Zoom's could not be downloaded) and writes it again. */
export async function uploadTranscript(id: string, input: z.input<typeof fileInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (!aiConfig()) return noAi
  const recap = await readRecap(id)
  if (!recap) return missing
  if (working(recap)) return { ok: false, code: "conflict", message: "The AI is already writing this recap." }
  const parsed = fileInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Upload the transcript again." }
  const previous = recap.transcript.path
  await recaps().doc(recap.id).update({
    "transcript.status": "pending",
    "transcript.source": "upload",
    "transcript.path": parsed.data.path,
    "transcript.name": parsed.data.name,
    "transcript.contentType": parsed.data.contentType,
    "transcript.downloadUrls": [],
    "transcript.downloadToken": null,
    "transcript.message": null,
    "transcript.claimId": null,
    "transcript.requestedAt": Timestamp.now(),
    "transcript.finishedAt": null,
    updatedAt: Timestamp.now(),
  })
  if (previous && previous !== parsed.data.path) await adminBucket().file(previous).delete({ ignoreNotFound: true })
  await audit(viewer, "recap.transcript_uploaded", recap.id)
  queueRecap(recap.id)
  refresh()
  return { ok: true, data: undefined }
}

const line = z.string().trim().max(1000)
const list = (max: number) =>
  z
    .array(line)
    .max(max)
    .transform((items) => items.filter((item) => item !== ""))

const summaryInput = z.object({
  title,
  date,
  summary: z.object({
    overview: z.string().trim().min(1, "Write the overview").max(3000),
    keyPoints: list(40),
    tickers: z
      .array(z.object({ symbol: z.string().trim().toUpperCase().max(12), note: line }))
      .max(60)
      .transform((items) => items.filter((t) => t.symbol !== "")),
    actionItems: list(30),
    questions: z
      .array(z.object({ question: line, answer: z.string().trim().max(3000) }))
      .max(40)
      .transform((items) => items.filter((q) => q.question !== "")),
  }),
})

/** Saves an admin's corrections to the AI's recap. */
export async function saveRecap(id: string, input: z.input<typeof summaryInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const recap = await readRecap(id)
  if (!recap) return missing
  if (working(recap))
    return { ok: false, code: "conflict", message: "The AI is writing this recap. Save once it is done." }
  const parsed = summaryInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  await recaps()
    .doc(recap.id)
    .update({ ...parsed.data, updatedAt: Timestamp.now() })
  await audit(viewer, "recap.edited", recap.id)
  refresh()
  return { ok: true, data: undefined }
}

/** Shows a recap to members (telling them the first time) or hides it again. */
export async function setRecapPublished(id: string, published: boolean): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (typeof published !== "boolean") return { ok: false, code: "validation", message: "Choose show or hide." }
  const recap = await readRecap(id)
  if (!recap) return missing
  if (published && !recap.summary)
    return { ok: false, code: "validation", message: "Publish the recap once it is written." }
  await recaps().doc(recap.id).update({ published, updatedAt: Timestamp.now() })
  await audit(viewer, published ? "recap.published" : "recap.hidden", recap.id)
  if (published) after(() => notifyRecapOnce(adminDb(), adminMessaging(), recap.id))
  refresh()
  return { ok: true, data: undefined }
}

const recordingInput = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https$/, error: "Paste the full https:// link to the recording" }).nullable())

/** The class recording's link (Zoom's share link fills it in by itself when Zoom is connected). */
export async function saveRecording(id: string, url: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const recap = await readRecap(id)
  if (!recap) return missing
  const parsed = recordingInput.safeParse(url)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the link." }
  await recaps().doc(recap.id).update({ recordingUrl: parsed.data, updatedAt: Timestamp.now() })
  await audit(viewer, "recap.recording_saved", recap.id)
  refresh()
  return { ok: true, data: undefined }
}

/** Emails the recording's link to members (all, some levels or chosen people) and tells them in the app. */
export async function sendRecording(
  id: string,
  audience: z.input<typeof audienceInput>,
): Promise<ActionResult<{ members: number; emailed: number }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const recap = await readRecap(id)
  if (!recap) return missing
  if (!recap.recordingUrl) return { ok: false, code: "validation", message: "Add the recording's link first." }
  const to = audienceInput.safeParse(audience)
  if (!to.success)
    return { ok: false, code: "validation", message: to.error.issues[0]?.message ?? "Choose who gets it." }
  const sent = await sendClassMaterial(
    adminDb(),
    adminMessaging(),
    emailConfig(),
    publicEnv.NEXT_PUBLIC_SITE_URL,
    {
      title: recap.title,
      date: recap.date,
      slidesPath: null,
      recordingUrl: recap.recordingUrl,
      openPath: recap.published && recap.summary ? `/members/classroom/recaps/${recap.id}` : "/members/classroom",
      tag: `recording-${recap.id}`,
    },
    to.data,
  )
  if (sent.members === 0) return { ok: false, code: "validation", message: "Nobody with access matches that choice." }
  await recaps().doc(recap.id).update({ recordingSentAt: Timestamp.now(), recordingSentTo: sent.members })
  await audit(viewer, "recap.recording_sent", recap.id, { to: to.data.to, members: sent.members })
  refresh()
  return { ok: true, data: sent }
}

/** Deletes a recap and its stored transcript. */
export async function deleteRecap(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const recap = await readRecap(id)
  if (!recap) return missing
  if (working(recap))
    return { ok: false, code: "conflict", message: "The AI is writing this recap. Delete it once it is done." }
  if (recap.transcript.path) await adminBucket().file(recap.transcript.path).delete({ ignoreNotFound: true })
  await recaps().doc(recap.id).delete()
  await audit(viewer, "recap.deleted", recap.id, { date: recap.date })
  refresh()
  return { ok: true, data: undefined }
}
