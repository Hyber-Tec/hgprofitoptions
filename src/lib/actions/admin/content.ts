"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { z } from "zod"
import { isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, isDocId, parseDoc, presentationSchema } from "@/server/model"
import { sendClassMaterial } from "@/server/notifications"
import { audienceInput } from "@/lib/audience"
import { adminForAction } from "@/lib/auth/guards"
import { publicEnv } from "@/lib/env.public"
import { emailConfig } from "@/lib/env.server"
import { invalidatePublicCache } from "@/lib/data/public"
import { adminBucket, adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
const storagePath = z
  .string()
  .regex(/^content\/[\w./-]{1,200}$/)
  .refine((p) => !p.includes(".."), "Invalid path")

// ---- Presentations ----------------------------------------------------------------------------

const presentationInput = z.object({
  title: z.string().trim().min(2).max(120),
  sessionDate: z.string().refine(isIsoDate, "Pick the class date"),
  summary: optional(500),
  slidesPath: storagePath.nullable(),
  videoUrl: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.url("Enter the full recording link").nullable()),
  published: z.boolean(),
})

export async function savePresentation(
  id: string | null,
  input: z.input<typeof presentationInput>,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = presentationInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const ref = id
    ? adminDb().collection(COLLECTIONS.presentations).doc(id)
    : adminDb().collection(COLLECTIONS.presentations).doc()
  await ref.set({ ...parsed.data, ...(id ? {} : { createdAt: Timestamp.now() }) }, { merge: true })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: id ? "presentation.updated" : "presentation.created",
    targetType: "presentation",
    targetId: ref.id,
  })
  refresh()
  return { ok: true, data: { id: ref.id } }
}

export async function deletePresentation(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const ref = adminDb().collection(COLLECTIONS.presentations).doc(id)
  const snap = await ref.get()
  const path = snap.get("slidesPath") as string | null | undefined
  if (path) await adminBucket().file(path).delete({ ignoreNotFound: true })
  await ref.delete()
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "presentation.deleted",
    targetType: "presentation",
    targetId: id,
  })
  refresh()
  return { ok: true, data: undefined }
}

const sendInput = z
  .object({ slides: z.boolean(), recording: z.boolean(), audience: audienceInput })
  .refine((v) => v.slides || v.recording, "Choose the slides, the recording or both")

/** Emails a class's slides and recording to members (all, some levels or chosen people) and tells them in the app. */
export async function sendPresentation(
  id: string,
  input: z.input<typeof sendInput>,
): Promise<ActionResult<{ members: number; emailed: number }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = sendInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  if (!isDocId(id)) return { ok: false, code: "validation", message: "Invalid presentation." }
  const ref = adminDb().collection(COLLECTIONS.presentations).doc(id)
  const snap = await ref.get()
  const presentation = snap.exists ? parseDoc(presentationSchema, snap.id, snap.data()) : null
  if (!presentation) return { ok: false, code: "not-found", message: "This presentation no longer exists." }
  if (!presentation.published)
    return { ok: false, code: "validation", message: "Publish it first, so members can open it." }
  const { slides, recording, audience } = parsed.data
  if (slides && !presentation.slidesPath) return { ok: false, code: "validation", message: "It has no slides yet." }
  if (recording && !presentation.videoUrl)
    return { ok: false, code: "validation", message: "It has no recording link yet." }
  const sent = await sendClassMaterial(
    adminDb(),
    adminMessaging(),
    emailConfig(),
    publicEnv.NEXT_PUBLIC_SITE_URL,
    {
      title: presentation.title,
      date: presentation.sessionDate,
      slidesPath: slides ? "/members/presentations" : null,
      recordingUrl: recording ? presentation.videoUrl : null,
      openPath: "/members/presentations",
      tag: `presentation-${presentation.id}`,
    },
    audience,
  )
  if (sent.members === 0) return { ok: false, code: "validation", message: "Nobody with access matches that choice." }
  await ref.update({ sentAt: Timestamp.now(), sentTo: sent.members })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "presentation.sent",
    targetType: "presentation",
    targetId: id,
    detail: { to: audience.to, members: sent.members, slides, recording },
  })
  refresh()
  return { ok: true, data: sent }
}

// ---- Files ------------------------------------------------------------------------------------

const resourceInput = z.object({
  folder: z.string().trim().min(1).max(60),
  title: z.string().trim().min(2).max(120),
  description: optional(300),
  storagePath,
  mimeType: z.string().max(100).nullable(),
  sizeBytes: z.number().int().min(0).nullable(),
  published: z.boolean(),
})

export async function saveResource(
  id: string | null,
  input: z.input<typeof resourceInput>,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = resourceInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const ref = id
    ? adminDb().collection(COLLECTIONS.resources).doc(id)
    : adminDb().collection(COLLECTIONS.resources).doc()
  await ref.set({ ...parsed.data, ...(id ? {} : { createdAt: Timestamp.now() }) }, { merge: true })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: id ? "file.updated" : "file.created",
    targetType: "file",
    targetId: ref.id,
  })
  refresh()
  return { ok: true, data: { id: ref.id } }
}

export async function deleteResource(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const ref = adminDb().collection(COLLECTIONS.resources).doc(id)
  const path = (await ref.get()).get("storagePath") as string | undefined
  if (path) await adminBucket().file(path).delete({ ignoreNotFound: true })
  await ref.delete()
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "file.deleted",
    targetType: "file",
    targetId: id,
  })
  refresh()
  return { ok: true, data: undefined }
}

// ---- Testimonials -----------------------------------------------------------------------------

const testimonialInput = z.object({
  name: z.string().trim().min(2).max(60),
  location: z.string().trim().min(2).max(60),
  avatar: optional(300),
  flag: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/, "Use a two-letter country code")
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  quote: z.string().trim().min(10).max(1200),
  trade: z
    .object({
      symbol: z.string().trim().toUpperCase().min(1).max(6),
      type: z.enum(["call", "put"]),
      strike: z.number().positive(),
      expiryLabel: z.string().trim().min(1).max(10),
      realizedProfit: z.number(),
      currency: z.string().length(3),
      percentGain: z.number(),
    })
    .nullable(),
  published: z.boolean(),
  order: z.number().int().min(0).max(1000),
})

export async function saveTestimonial(
  id: string | null,
  input: z.input<typeof testimonialInput>,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = testimonialInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const ref = id
    ? adminDb().collection(COLLECTIONS.testimonials).doc(id)
    : adminDb().collection(COLLECTIONS.testimonials).doc()
  await ref.set({ ...parsed.data, updatedAt: Timestamp.now() })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: id ? "testimonial.updated" : "testimonial.created",
    targetType: "testimonial",
    targetId: ref.id,
  })
  invalidatePublicCache()
  refresh()
  return { ok: true, data: { id: ref.id } }
}

export async function deleteTestimonial(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  await adminDb().collection(COLLECTIONS.testimonials).doc(id).delete()
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "testimonial.deleted",
    targetType: "testimonial",
    targetId: id,
  })
  invalidatePublicCache()
  refresh()
  return { ok: true, data: undefined }
}

// ---- FAQ --------------------------------------------------------------------------------------

const faqInput = z.object({
  group: z.string().trim().min(2).max(60),
  question: z.string().trim().min(5).max(200),
  subtitle: optional(200),
  answer: z.array(z.string().trim().min(1).max(2000)).min(1).max(10),
  published: z.boolean(),
  order: z.number().int().min(0).max(1000),
})

export async function saveFaq(
  id: string | null,
  input: z.input<typeof faqInput>,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = faqInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const ref = id ? adminDb().collection(COLLECTIONS.faqs).doc(id) : adminDb().collection(COLLECTIONS.faqs).doc()
  await ref.set({ ...parsed.data, updatedAt: Timestamp.now() })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: id ? "faq.updated" : "faq.created",
    targetType: "faq",
    targetId: ref.id,
  })
  invalidatePublicCache()
  refresh()
  return { ok: true, data: { id: ref.id } }
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  await adminDb().collection(COLLECTIONS.faqs).doc(id).delete()
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "faq.deleted",
    targetType: "faq",
    targetId: id,
  })
  invalidatePublicCache()
  refresh()
  return { ok: true, data: undefined }
}
