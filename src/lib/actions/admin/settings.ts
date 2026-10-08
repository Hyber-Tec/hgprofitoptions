"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { todayInMarketZone } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS } from "@/server/model"
import { computeStanding } from "@/server/standing"
import { adminForAction } from "@/lib/auth/guards"
import { invalidate } from "@/lib/data/cache"
import { invalidatePublicCache } from "@/lib/data/public"
import { adminDb } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const

const url = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url("Enter a full link starting with https://").nullable())

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")

const siteInput = z.object({
  bookingUrl: z.url("Enter the full booking link"),
  instagramUrl: url,
  youtubeUrl: url,
  xUrl: url,
  classSchedule: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        start: time,
        end: time,
        title: z.string().trim().min(1).max(60),
        audience: z.string().trim().max(80),
      }),
    )
    .max(10)
    .refine((list) => list.every((s) => s.start < s.end), "Each class must end after it starts"),
})

export async function updateSiteSettings(input: z.input<typeof siteInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = siteInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  await adminDb().collection(COLLECTIONS.settings).doc("site").set(parsed.data)
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "settings.site_updated",
    targetType: "settings",
    targetId: "site",
  })
  invalidatePublicCache()
  refresh()
  return { ok: true, data: undefined }
}

const memberInput = z.object({
  zoomUrl: url,
  whatsappUrl: url,
  oneOnOneUrl: url,
  expiringSoonDays: z.number().int().min(1).max(60),
  sessionLimit: z.number().int().min(1).max(10),
  setupTags: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
})

export async function updateMemberSettings(input: z.input<typeof memberInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = memberInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  await adminDb().collection(COLLECTIONS.settings).doc("members").set(parsed.data, { merge: true })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "settings.members_updated",
    targetType: "settings",
    targetId: "members",
  })
  invalidate("settings:")
  refresh()
  return { ok: true, data: undefined }
}

const visibilityInput = z.object({
  showDollars: z.boolean(),
  showPositions: z.boolean(),
  showClosedTrades: z.boolean(),
  positionDelayHours: z.number().int().min(0).max(168),
})

/** What members see of HG's portfolio. The standing is recomputed right away so the change shows. */
export async function updateHgVisibility(input: z.input<typeof visibilityInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = visibilityInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Check the fields." }
  await adminDb().collection(COLLECTIONS.settings).doc("members").set({ hgPortfolio: parsed.data }, { merge: true })
  invalidate("settings:")
  await computeStanding(adminDb(), todayInMarketZone())
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "settings.hg_visibility_updated",
    targetType: "settings",
    targetId: "members",
    detail: parsed.data,
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Marks one of an admin's brokerage connections (and its accounts) as an HG house account. */
export async function setHouseConnection(uid: string, connectionId: string, isHouse: boolean): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const member = adminDb().collection(COLLECTIONS.members).doc(uid)
  if ((await member.get()).get("role") !== "admin")
    return { ok: false, code: "validation", message: "Only admins' accounts can be house accounts." }
  const connection = member.collection(MEMBER_SUBCOLLECTIONS.connections).doc(connectionId)
  if (!(await connection.get()).exists)
    return { ok: false, code: "not-found", message: "This connection no longer exists." }
  const accounts = await member
    .collection(MEMBER_SUBCOLLECTIONS.accounts)
    .where("connectionId", "==", connectionId)
    .get()
  const batch = adminDb().batch()
  batch.update(connection, { isHouse })
  for (const a of accounts.docs) batch.update(a.ref, { isHouse })
  await batch.commit()
  await computeStanding(adminDb(), todayInMarketZone())
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: isHouse ? "hg.house_added" : "hg.house_removed",
    targetType: "connection",
    targetId: connectionId,
  })
  refresh()
  return { ok: true, data: undefined }
}

export async function recomputeStanding(): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  await computeStanding(adminDb(), todayInMarketZone())
  refresh()
  return { ok: true, data: undefined }
}
