"use server"

import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { z } from "zod"
import type { ActionResult } from "@/core/domain/types"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, alertKindSchema } from "@/server/model"
import { getViewer } from "@/lib/auth/guards"
import { readSession, revokeAllSessions } from "@/lib/auth/session"
import { adminDb } from "@/lib/firebase/admin"

const unauthorized = {
  ok: false,
  code: "unauthorized",
  message: "Your session has ended. Please sign in again.",
} as const
const member = (uid: string) => adminDb().collection(COLLECTIONS.members).doc(uid)

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()

const profileInput = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  phone: optional(40),
  whatsapp: optional(40),
  location: optional(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz })
      return true
    } catch {
      return false
    }
  }, "Choose a time zone"),
})

export async function updateProfile(input: z.input<typeof profileInput>): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  const parsed = profileInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  await member(viewer.uid).update({ ...parsed.data, updatedAt: Timestamp.now() })
  refresh()
  return { ok: true, data: undefined }
}

const prefsInput = z.object({
  pushKinds: z.array(alertKindSchema),
  emailKinds: z.array(alertKindSchema),
  mutedSymbols: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z][A-Z.]{0,5}$/),
    )
    .max(200),
  targetsPublished: z.boolean(),
  membershipReminders: z.boolean(),
})

export async function updateNotificationPrefs(input: z.input<typeof prefsInput>): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  const parsed = prefsInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Some settings were invalid." }
  const prefs = { ...parsed.data, mutedSymbols: [...new Set(parsed.data.mutedSymbols)].sort() }
  await member(viewer.uid).update({ prefs })
  refresh()
  return { ok: true, data: undefined }
}

/** Signs out one other browser. */
export async function revokeSession(sessionId: string): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  if (!z.uuid().safeParse(sessionId).success) return { ok: false, code: "validation", message: "Invalid session." }
  const sessions = member(viewer.uid).collection(MEMBER_SUBCOLLECTIONS.sessions)
  await sessions.doc(sessionId).delete()
  const tokens = await member(viewer.uid)
    .collection(MEMBER_SUBCOLLECTIONS.fcmTokens)
    .where("sessionId", "==", sessionId)
    .get()
  await Promise.all(tokens.docs.map((d) => d.ref.delete()))
  refresh()
  return { ok: true, data: undefined }
}

/** Signs out every other browser (this one stays signed in). */
export async function revokeOtherSessions(): Promise<ActionResult<{ count: number }>> {
  const viewer = await getViewer()
  const session = await readSession()
  if (!viewer || !session) return unauthorized
  const sessions = await member(viewer.uid).collection(MEMBER_SUBCOLLECTIONS.sessions).get()
  const others = sessions.docs.filter((d) => d.id !== session.sid)
  await Promise.all(others.map((d) => d.ref.delete()))
  refresh()
  return { ok: true, data: { count: others.length } }
}

/** Signs out everywhere, this browser included (used after a password change or a lost device). */
export async function signOutEverywhere(): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  await revokeAllSessions(viewer.uid)
  return { ok: true, data: undefined }
}

/** Asks HG to delete the account. The data is not removed until an admin confirms it. */
export async function requestAccountDeletion(reason: string): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  await member(viewer.uid).update({
    deletionRequestedAt: Timestamp.now(),
    deletionReason: reason.trim().slice(0, 1000) || null,
  })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "member.deletion_requested",
    targetType: "member",
    targetId: viewer.uid,
    detail: { reason: reason.trim().slice(0, 200) || null },
  })
  refresh()
  return { ok: true, data: undefined }
}

export async function cancelAccountDeletion(): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  await member(viewer.uid).update({ deletionRequestedAt: FieldValue.delete(), deletionReason: FieldValue.delete() })
  refresh()
  return { ok: true, data: undefined }
}
