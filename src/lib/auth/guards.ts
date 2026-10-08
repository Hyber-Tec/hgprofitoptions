import "server-only"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import { todayInMarketZone } from "@/core/dates"
import type { MembershipStatus } from "@/core/domain/types"
import { hasAccess, membershipStatus } from "@/core/membership/quarters"
import { readPeriods, toMembershipPeriods } from "@/server/members"
import { COLLECTIONS, memberSchema, memberSettingsSchema, parseDoc, type Member, type PeriodDoc } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"
import { useEmulators } from "@/lib/env.public"
import { cookieUid, readSession } from "./session"

export interface Viewer {
  uid: string
  email: string
  fullName: string
  firstName: string
  role: Member["role"]
  member: Member
  periods: PeriodDoc[]
  status: MembershipStatus
  hasAccess: boolean
  mfa: boolean
}

/** Admins must use two-step verification in production. The emulators do not support TOTP. */
export const adminMfaRequired = process.env.REQUIRE_ADMIN_MFA !== "false" && !useEmulators

/** The signed-in member for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const uid = await cookieUid()
  if (!uid) return null
  const db = adminDb()
  // The member's records load alongside the session checks and are used only if those pass.
  const [session, memberSnap, periods, settingsSnap] = await Promise.all([
    readSession(),
    db.collection(COLLECTIONS.members).doc(uid).get(),
    readPeriods(db, uid),
    db.collection(COLLECTIONS.settings).doc("members").get(),
  ])
  if (!session) return null
  const parsed = memberSnap.exists ? parseDoc(memberSchema, session.uid, memberSnap.data()) : null
  if (!parsed) return null
  const member: Member = { ...parsed, uid: session.uid }
  const settings = memberSettingsSchema.parse(settingsSnap.data() ?? {})
  const status = membershipStatus({
    role: member.role,
    status: member.status,
    periods: toMembershipPeriods(periods),
    today: todayInMarketZone(),
    expiringSoonDays: settings.expiringSoonDays,
  })
  if (status.kind === "suspended") return null
  return {
    uid: session.uid,
    email: member.email,
    fullName: member.fullName,
    firstName: member.fullName.split(/\s+/)[0] ?? member.fullName,
    role: member.role,
    member,
    periods,
    status,
    hasAccess: hasAccess(status),
    mfa: session.mfa,
  }
})

export async function requireViewer(next = "/members"): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`)
  return viewer
}

/** Members with a current period (and admins). Everyone else sees the membership status page. */
export async function requireActiveMember(next = "/members"): Promise<Viewer> {
  const viewer = await requireViewer(next)
  if (!viewer.hasAccess) redirect("/members/inactive")
  return viewer
}

/**
 * Admins only. Without a second-factor session, admins are sent to set up or use two-step
 * verification first (unless `allowWithoutMfa` for that setup page itself).
 */
export async function requireAdmin(options: { next?: string; allowWithoutMfa?: boolean } = {}): Promise<Viewer> {
  const viewer = await requireViewer(options.next ?? "/admin")
  if (viewer.role !== "admin") notFound()
  if (adminMfaRequired && !viewer.mfa && !options.allowWithoutMfa) redirect("/admin/security")
  return viewer
}

/** For Server Actions: the same checks, but returning instead of redirecting. */
export async function adminForAction(): Promise<Viewer | null> {
  const viewer = await getViewer()
  if (!viewer || viewer.role !== "admin") return null
  if (adminMfaRequired && !viewer.mfa) return null
  return viewer
}

export async function activeMemberForAction(): Promise<Viewer | null> {
  const viewer = await getViewer()
  return viewer?.hasAccess ? viewer : null
}
