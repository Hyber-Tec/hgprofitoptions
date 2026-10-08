"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { z } from "zod"
import { isIsoDate, todayInMarketZone } from "@/core/dates"
import type { ActionResult, IsoDate } from "@/core/domain/types"
import { describePeriodRange, isQuarter, nextRenewalQuarter, periodFromQuarters } from "@/core/membership/quarters"
import { parseMembersCsv } from "@/core/parsers/members-csv"
import { forgetSnapUser } from "@/server/brokerage/sync"
import { layout, sendEmail } from "@/server/email"
import {
  InviteConflictError,
  createInvite,
  inviteUrl,
  readInvite,
  renewInviteToken,
  revokeInvite,
} from "@/server/invites"
import { OverlapError, addPeriod, readPeriods, recomputeAccess, writeAudit } from "@/server/members"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, memberSchema, parseDoc } from "@/server/model"
import { adminForAction, type Viewer } from "@/lib/auth/guards"
import { revokeAllSessions } from "@/lib/auth/session"
import { publicEnv } from "@/lib/env.public"
import { brokerageConfig, emailConfig } from "@/lib/env.server"
import { adminAuth, adminBucket, adminDb } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const
const actor = (v: Viewer) => ({ uid: v.uid, email: v.email })
const member = (uid: string) => adminDb().collection(COLLECTIONS.members).doc(uid)

async function readMember(uid: string) {
  const snap = await member(uid).get()
  const parsed = snap.exists ? parseDoc(memberSchema, uid, snap.data()) : null
  return parsed ? { ...parsed, uid } : null
}

async function adminCount(): Promise<number> {
  return (await adminDb().collection(COLLECTIONS.members).where("role", "==", "admin").count().get()).data().count
}

// ---- Invites ----------------------------------------------------------------------------------

const startInput = z
  .object({
    year: z.number().int().min(2020).max(2100),
    quarter: z.number().int().refine(isQuarter, "Pick a quarter"),
    count: z.number().int().min(1).max(8),
    customStart: z.string().nullable(),
  })
  .nullable()

const inviteInput = z.object({
  email: z.email("Enter a valid email").transform((v) => v.trim().toLowerCase()),
  fullName: z.string().trim().min(2, "Enter the full name").max(80),
  role: z.enum(["member", "admin"]),
  phone: z.string().trim().max(40).nullable(),
  whatsapp: z.string().trim().max(40).nullable(),
  location: z.string().trim().max(80).nullable(),
  timezone: z.string().trim().max(60),
  notes: z.string().trim().max(4000).nullable(),
  start: startInput,
  sendEmail: z.boolean(),
})

export type InviteFormInput = z.input<typeof inviteInput>

async function emailInvite(
  to: { email: string; fullName: string },
  link: string,
  periodText: string | null,
): Promise<boolean> {
  const config = emailConfig()
  if (!config) return false
  const { html, text } = layout({
    heading: `Welcome to HG Profit Options, ${to.fullName.split(" ")[0] ?? to.fullName}`,
    paragraphs: [
      "HG has added you as a member. Open the link below to create your login. You can also sign in with Google using this email address.",
      ...(periodText ? [`Your membership: ${periodText}.`] : []),
      "The link works once and expires in 14 days.",
    ],
    cta: { label: "Create my login", href: link },
  })
  await sendEmail(config, { to: to.email, subject: "Your HG Profit Options membership", html, text })
  return true
}

export async function inviteMember(input: InviteFormInput): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = inviteInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  const v = parsed.data
  let periods: ReturnType<typeof periodFromQuarters>[] = []
  if (v.start) {
    if (v.start.customStart && !isIsoDate(v.start.customStart))
      return { ok: false, code: "validation", message: "The custom start date is not valid." }
    try {
      periods = [
        periodFromQuarters(
          v.start.year,
          v.start.quarter,
          v.start.count,
          (v.start.customStart as IsoDate | null) ?? undefined,
        ),
      ]
    } catch (error) {
      return { ok: false, code: "validation", message: error instanceof Error ? error.message : "Invalid period." }
    }
  } else if (v.role === "member") {
    return { ok: false, code: "validation", message: "Members need a membership period." }
  }
  try {
    const { token } = await createInvite(
      adminDb(),
      {
        email: v.email,
        fullName: v.fullName,
        role: v.role,
        phone: v.phone,
        whatsapp: v.whatsapp,
        location: v.location,
        timezone: v.timezone || "America/New_York",
        notes: v.notes,
        periods,
      },
      actor(viewer),
    )
    const link = inviteUrl(publicEnv.NEXT_PUBLIC_SITE_URL, token)
    const period = periods[0]
    const emailed = v.sendEmail
      ? await emailInvite(
          { email: v.email, fullName: v.fullName },
          link,
          period ? `${period.label} (${describePeriodRange(period.start, period.end)})` : null,
        ).catch(() => false)
      : false
    refresh()
    return { ok: true, data: { link, emailed } }
  } catch (error) {
    if (error instanceof InviteConflictError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
}

export async function resendInvite(email: string): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  try {
    const { token } = await renewInviteToken(adminDb(), email, actor(viewer))
    const invite = await readInvite(adminDb(), email)
    const link = inviteUrl(publicEnv.NEXT_PUBLIC_SITE_URL, token)
    const period = invite?.periods[0]
    const emailed = invite ? await emailInvite(invite, link, period ? period.label : null).catch(() => false) : false
    refresh()
    return { ok: true, data: { link, emailed } }
  } catch (error) {
    if (error instanceof InviteConflictError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
}

export async function cancelInvite(email: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  try {
    await revokeInvite(adminDb(), email, actor(viewer))
  } catch (error) {
    if (error instanceof InviteConflictError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
  refresh()
  return { ok: true, data: undefined }
}

// ---- Periods ----------------------------------------------------------------------------------

const periodInput = z.object({
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().refine(isQuarter),
  count: z.number().int().min(1).max(8),
  customStart: z.string().nullable(),
  note: z.string().trim().max(200).nullable(),
})

export async function addMemberPeriod(uid: string, input: z.input<typeof periodInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = periodInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Pick a quarter, year and length." }
  const target = await readMember(uid)
  if (!target) return { ok: false, code: "not-found", message: "This member no longer exists." }
  try {
    const draft = periodFromQuarters(
      parsed.data.year,
      parsed.data.quarter,
      parsed.data.count,
      (parsed.data.customStart as IsoDate | null) ?? undefined,
    )
    await addPeriod(adminDb(), uid, { ...draft, note: parsed.data.note }, viewer.uid)
    await writeAudit(adminDb(), {
      actorUid: viewer.uid,
      actorEmail: viewer.email,
      action: "period.added",
      targetType: "member",
      targetId: uid,
      detail: { label: draft.label, start: draft.start, end: draft.end },
    })
  } catch (error) {
    if (error instanceof OverlapError || error instanceof RangeError)
      return { ok: false, code: "conflict", message: error.message }
    throw error
  }
  refresh()
  return { ok: true, data: undefined }
}

/** Adds the next whole quarter after each member's latest period. */
export async function renewNextQuarter(
  uids: string[],
): Promise<ActionResult<{ renewed: string[]; failed: { uid: string; message: string }[] }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (!Array.isArray(uids) || uids.length === 0 || uids.length > 500)
    return { ok: false, code: "validation", message: "Pick at least one member." }
  const today = todayInMarketZone()
  const renewed: string[] = []
  const failed: { uid: string; message: string }[] = []
  for (const uid of uids) {
    try {
      const periods = await readPeriods(adminDb(), uid)
      const next = nextRenewalQuarter(periods, today)
      const draft = periodFromQuarters(next.year, next.q, 1)
      await addPeriod(adminDb(), uid, { ...draft, note: null }, viewer.uid)
      await writeAudit(adminDb(), {
        actorUid: viewer.uid,
        actorEmail: viewer.email,
        action: "period.renewed",
        targetType: "member",
        targetId: uid,
        detail: { label: draft.label },
      })
      renewed.push(uid)
    } catch (error) {
      failed.push({ uid, message: error instanceof Error ? error.message : "Failed" })
    }
  }
  refresh()
  return { ok: true, data: { renewed, failed } }
}

export async function removeMemberPeriod(uid: string, periodId: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const ref = member(uid).collection(MEMBER_SUBCOLLECTIONS.periods).doc(periodId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, code: "not-found", message: "This period no longer exists." }
  await ref.delete()
  await recomputeAccess(adminDb(), uid)
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "period.removed",
    targetType: "member",
    targetId: uid,
    detail: { label: snap.get("label") as string },
  })
  refresh()
  return { ok: true, data: undefined }
}

// ---- Profile, status and role -------------------------------------------------------------------

const profileInput = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).nullable(),
  whatsapp: z.string().trim().max(40).nullable(),
  location: z.string().trim().max(80).nullable(),
  timezone: z.string().trim().max(60),
})

export async function updateMemberProfile(uid: string, input: z.input<typeof profileInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = profileInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message: "Check the fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  if (!(await readMember(uid))) return { ok: false, code: "not-found", message: "This member no longer exists." }
  await member(uid).update({
    ...parsed.data,
    phone: parsed.data.phone || null,
    whatsapp: parsed.data.whatsapp || null,
    location: parsed.data.location || null,
  })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "member.updated",
    targetType: "member",
    targetId: uid,
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Suspension is immediate: sign-in is disabled, sessions end and notifications stop. */
export async function setMemberSuspended(uid: string, suspended: boolean): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (uid === viewer.uid) return { ok: false, code: "forbidden", message: "You cannot suspend yourself." }
  const target = await readMember(uid)
  if (!target) return { ok: false, code: "not-found", message: "This member no longer exists." }
  await member(uid).update({ status: suspended ? "suspended" : "active" })
  await adminAuth().updateUser(uid, { disabled: suspended })
  if (suspended) {
    await revokeAllSessions(uid)
    const tokens = await member(uid).collection(MEMBER_SUBCOLLECTIONS.fcmTokens).get()
    await Promise.all(tokens.docs.map((d) => d.ref.delete()))
  }
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: suspended ? "member.suspended" : "member.reinstated",
    targetType: "member",
    targetId: uid,
  })
  refresh()
  return { ok: true, data: undefined }
}

export async function setMemberRole(uid: string, role: "admin" | "member"): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (uid === viewer.uid && role !== "admin")
    return { ok: false, code: "forbidden", message: "You cannot remove your own admin role." }
  const target = await readMember(uid)
  if (!target) return { ok: false, code: "not-found", message: "This member no longer exists." }
  if (target.role === "admin" && role === "member" && (await adminCount()) <= 1)
    return { ok: false, code: "forbidden", message: "There must always be at least one admin." }
  await member(uid).update({ role })
  await adminAuth().setCustomUserClaims(uid, role === "admin" ? { role: "admin" } : null)
  // End sessions so the change applies everywhere at once.
  await revokeAllSessions(uid)
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: role === "admin" ? "member.promoted" : "member.demoted",
    targetType: "member",
    targetId: uid,
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Removes the login, personal data, journal, brokerage data and files. The audit log keeps a minimal record. */
export async function deleteMember(uid: string, confirmEmail: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (uid === viewer.uid) return { ok: false, code: "forbidden", message: "You cannot delete your own account here." }
  const target = await readMember(uid)
  if (!target) return { ok: false, code: "not-found", message: "This member no longer exists." }
  if (confirmEmail.trim().toLowerCase() !== target.emailLower)
    return { ok: false, code: "validation", message: "Type the member's email exactly to confirm." }
  if (target.role === "admin" && (await adminCount()) <= 1)
    return { ok: false, code: "forbidden", message: "There must always be at least one admin." }
  const config = brokerageConfig()
  if (config) await forgetSnapUser(adminDb(), config, uid).catch(() => undefined)
  await adminDb().recursiveDelete(member(uid))
  await adminDb().collection(COLLECTIONS.invites).doc(target.emailLower).delete()
  await adminBucket()
    .deleteFiles({ prefix: `journal/${uid}/` })
    .catch(() => undefined)
  await adminAuth()
    .deleteUser(uid)
    .catch(() => undefined)
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "member.deleted",
    targetType: "member",
    targetId: uid,
    detail: { role: target.role },
  })
  return { ok: true, data: undefined }
}

export async function passwordResetLink(uid: string): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const target = await readMember(uid)
  if (!target) return { ok: false, code: "not-found", message: "This member no longer exists." }
  const link = await adminAuth().generatePasswordResetLink(target.email, {
    url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/login`,
  })
  const config = emailConfig()
  let emailed = false
  if (config) {
    const { html, text } = layout({
      heading: "Reset your password",
      paragraphs: ["HG sent you a link to choose a new password for HG Profit Options. It expires in one hour."],
      cta: { label: "Choose a new password", href: link },
    })
    emailed = await sendEmail(config, {
      to: target.email,
      subject: "Reset your HG Profit Options password",
      html,
      text,
    })
      .then(() => true)
      .catch(() => false)
  }
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "member.password_reset",
    targetType: "member",
    targetId: uid,
  })
  return { ok: true, data: { link, emailed } }
}

export async function signOutMember(uid: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  await revokeAllSessions(uid)
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "member.signed_out",
    targetType: "member",
    targetId: uid,
  })
  refresh()
  return { ok: true, data: undefined }
}

export async function saveAdminNotes(uid: string, body: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (body.length > 20000) return { ok: false, code: "validation", message: "Notes are too long." }
  await member(uid)
    .collection(MEMBER_SUBCOLLECTIONS.adminNotes)
    .doc("notes")
    .set({ body, updatedAt: Timestamp.now(), updatedBy: viewer.uid })
  return { ok: true, data: undefined }
}

// ---- CSV import (Wix migration) -----------------------------------------------------------------

export interface MemberImportRow {
  line: number
  email: string
  fullName: string
  period: string | null
  status: "ready" | "exists" | "error"
  message: string | null
}

/**
 * Columns: see MEMBER_CSV_COLUMNS. Each valid row becomes a pending invitation with its period.
 * Existing members and people with a pending invitation are skipped, so links already sent keep working.
 */
export async function importMembersCsv(input: {
  csv: string
  commit: boolean
}): Promise<ActionResult<{ rows: MemberImportRow[]; created: number; links: { email: string; link: string }[] }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  if (input.csv.length > 1024 * 1024) return { ok: false, code: "validation", message: "The file is larger than 1 MB." }
  const parsed = parseMembersCsv(input.csv, todayInMarketZone())
  if ("error" in parsed) return { ok: false, code: "validation", message: parsed.error }
  if (parsed.rows.length === 0) return { ok: false, code: "validation", message: "The file has no member rows." }
  if (parsed.rows.length > 500)
    return { ok: false, code: "validation", message: "Import at most 500 members at a time." }
  const [members, invites] = await Promise.all([
    adminDb().collection(COLLECTIONS.members).select("emailLower").get(),
    adminDb().collection(COLLECTIONS.invites).where("status", "==", "pending").select().get(),
  ])
  const memberEmails = new Set(members.docs.map((d) => d.get("emailLower") as string))
  const invitedEmails = new Set(invites.docs.map((d) => d.id))
  const result: MemberImportRow[] = []
  const links: { email: string; link: string }[] = []
  let created = 0
  for (const row of parsed.rows) {
    const base = { line: row.line, email: row.email, fullName: row.fullName }
    if (row.error !== null || row.period === null) {
      result.push({ ...base, period: null, status: "error", message: row.error ?? "Invalid membership period." })
      continue
    }
    if (memberEmails.has(row.email)) {
      result.push({ ...base, period: null, status: "exists", message: "Already a member." })
      continue
    }
    if (invitedEmails.has(row.email)) {
      result.push({
        ...base,
        period: null,
        status: "exists",
        message: "Already invited. Resend the link from Members if needed.",
      })
      continue
    }
    const entry: MemberImportRow = {
      ...base,
      period: `${row.period.label} (${describePeriodRange(row.period.start, row.period.end)})`,
      status: "ready",
      message: null,
    }
    result.push(entry)
    if (!input.commit) continue
    try {
      const { token } = await createInvite(
        adminDb(),
        {
          email: row.email,
          fullName: row.fullName,
          role: "member",
          phone: row.phone,
          whatsapp: row.whatsapp,
          location: row.location,
          timezone: row.timezone,
          notes: row.notes,
          periods: [row.period],
        },
        actor(viewer),
      )
      links.push({ email: row.email, link: inviteUrl(publicEnv.NEXT_PUBLIC_SITE_URL, token) })
      created++
    } catch (error) {
      Object.assign(entry, {
        status: "error",
        message: error instanceof Error ? error.message : "Could not create the invitation.",
      })
    }
  }
  if (input.commit) refresh()
  return { ok: true, data: { rows: result, created, links } }
}
