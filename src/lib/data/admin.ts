import "server-only"
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore"
import { todayInMarketZone } from "@/core/dates"
import { formatDate } from "@/core/format"
import type { IsoDate, MembershipStatus } from "@/core/domain/types"
import { membershipStatus } from "@/core/membership/quarters"
import { toMembershipPeriods } from "@/server/members"
import {
  COLLECTIONS,
  MEMBER_SUBCOLLECTIONS,
  adminNotesSchema,
  auditSchema,
  inviteSchema,
  jobRunSchema,
  memberSchema,
  parseDoc,
  periodSchema,
  type AuditEntry,
  type Invite,
  type JobRun,
  type Member,
  type PeriodDoc,
} from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"
import { getMemberSettings } from "./settings"

export interface MemberRow {
  member: Member
  periods: PeriodDoc[]
  status: MembershipStatus
}

export async function listMembers(): Promise<Member[]> {
  const snap = await adminDb().collection(COLLECTIONS.members).get()
  return snap.docs
    .map((d) => {
      const parsed = parseDoc(memberSchema, d.id, d.data())
      return parsed ? { ...parsed, uid: d.id } : null
    })
    .filter((m): m is Member & { id: string } => m !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function listMembersForSearch(): Promise<{ uid: string; fullName: string; email: string }[]> {
  return (await listMembers()).map((m) => ({ uid: m.uid, fullName: m.fullName, email: m.email }))
}

/** Every member with their periods and computed membership status, using one collection-group read for periods. */
export async function listMemberRows(): Promise<MemberRow[]> {
  const [members, periodsSnap, settings] = await Promise.all([
    listMembers(),
    adminDb().collectionGroup(MEMBER_SUBCOLLECTIONS.periods).get(),
    getMemberSettings(),
  ])
  const byMember = new Map<string, PeriodDoc[]>()
  for (const doc of periodsSnap.docs) {
    const uid = doc.ref.parent.parent?.id
    if (!uid) continue
    const parsed = parseDoc(periodSchema, doc.id, doc.data())
    if (parsed) byMember.set(uid, [...(byMember.get(uid) ?? []), parsed])
  }
  const today = todayInMarketZone()
  return members.map((member) => {
    const periods = (byMember.get(member.uid) ?? []).sort((a, b) => a.start.localeCompare(b.start))
    return {
      member,
      periods,
      status: membershipStatus({
        role: member.role,
        status: member.status,
        periods: toMembershipPeriods(periods),
        today,
        expiringSoonDays: settings.expiringSoonDays,
      }),
    }
  })
}

export async function getMemberRow(uid: string): Promise<MemberRow | null> {
  const ref = adminDb().collection(COLLECTIONS.members).doc(uid)
  const [snap, periodsSnap, settings] = await Promise.all([
    ref.get(),
    ref.collection(MEMBER_SUBCOLLECTIONS.periods).orderBy("start").get(),
    getMemberSettings(),
  ])
  const parsed = snap.exists ? parseDoc(memberSchema, uid, snap.data()) : null
  if (!parsed) return null
  const member: Member = { ...parsed, uid }
  const periods = periodsSnap.docs
    .map((d) => parseDoc(periodSchema, d.id, d.data()))
    .filter((p): p is PeriodDoc => p !== null)
  return {
    member,
    periods,
    status: membershipStatus({
      role: member.role,
      status: member.status,
      periods: toMembershipPeriods(periods),
      today: todayInMarketZone(),
      expiringSoonDays: settings.expiringSoonDays,
    }),
  }
}

export async function listInvites(status: "pending" | "all" = "pending"): Promise<Invite[]> {
  const query =
    status === "pending"
      ? adminDb().collection(COLLECTIONS.invites).where("status", "==", "pending")
      : adminDb().collection(COLLECTIONS.invites)
  const snap = await query.get()
  return snap.docs
    .map((d) => parseDoc(inviteSchema, d.id, d.data()))
    .filter((i): i is Invite => i !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function getAdminNotes(uid: string): Promise<{ body: string; updatedAt: Date | null }> {
  const snap = await adminDb()
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.adminNotes)
    .doc("notes")
    .get()
  const parsed = adminNotesSchema.safeParse(snap.data())
  return parsed.success ? { body: parsed.data.body, updatedAt: parsed.data.updatedAt } : { body: "", updatedAt: null }
}

export interface LoginEntry {
  at: Date
  ip: string | null
  userAgent: string | null
  provider: string | null
}

export async function listLogins(uid: string, limit = 20): Promise<LoginEntry[]> {
  const snap = await adminDb()
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.logins)
    .orderBy("at", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => ({
    at: (d.get("at") as FirebaseTimestamp).toDate(),
    ip: (d.get("ip") as string | null | undefined) ?? null,
    userAgent: (d.get("userAgent") as string | null | undefined) ?? null,
    provider: (d.get("provider") as string | null | undefined) ?? null,
  }))
}

type FirebaseTimestamp = { toDate: () => Date }

const toAudit = (docs: QueryDocumentSnapshot[]) =>
  docs.map((d) => parseDoc(auditSchema, d.id, d.data())).filter((a): a is AuditEntry => a !== null)

export async function listAudit(
  options: { limit?: number; targetId?: string; categories?: readonly string[] } = {},
): Promise<AuditEntry[]> {
  let query: Query = adminDb().collection(COLLECTIONS.auditLog)
  if (options.targetId) query = query.where("targetId", "==", options.targetId)
  if (options.categories?.length) query = query.where("category", "in", options.categories)
  const snap = await query
    .orderBy("createdAt", "desc")
    .limit(options.limit ?? 200)
    .get()
  return toAudit(snap.docs)
}

export interface AuditTarget {
  label: string
  href: string | null
}

const TITLED: Record<string, { collection: string; field: string; noun: string; href: (id: string) => string }> = {
  member: { collection: COLLECTIONS.members, field: "fullName", noun: "Member", href: (id) => `/admin/members/${id}` },
  alert: { collection: COLLECTIONS.alerts, field: "title", noun: "Alert", href: (id) => `/admin/alerts/${id}` },
  presentation: {
    collection: COLLECTIONS.presentations,
    field: "title",
    noun: "Presentation",
    href: () => "/admin/presentations",
  },
  file: { collection: COLLECTIONS.resources, field: "title", noun: "File", href: () => "/admin/files" },
  testimonial: {
    collection: COLLECTIONS.testimonials,
    field: "name",
    noun: "Testimonial",
    href: () => "/admin/testimonials",
  },
  faq: { collection: COLLECTIONS.faqs, field: "question", noun: "Question", href: () => "/admin/faq" },
}

const SETTINGS_LABELS: Record<string, string> = {
  site: "Site settings",
  members: "Member settings",
  leveragedEtfs: "Leveraged ETF guide",
}

/** Readable names and links for the targets of audit entries, keyed by `${targetType}:${targetId}`. */
export async function resolveAuditTargets(entries: AuditEntry[]): Promise<Map<string, AuditTarget>> {
  const resolved = new Map<string, AuditTarget>()
  const lookups = new Map<string, { type: string; id: string }>()
  for (const e of entries) {
    if (!e.targetId) continue
    const key = `${e.targetType}:${e.targetId}`
    if (TITLED[e.targetType]) lookups.set(key, { type: e.targetType, id: e.targetId })
    else if (e.targetType === "targetUpdate")
      resolved.set(key, {
        label: `Targets for ${formatDate(e.targetId as IsoDate)}`,
        href: `/admin/targets/${e.targetId}`,
      })
    else if (e.targetType === "ticker") resolved.set(key, { label: e.targetId, href: `/members/stocks/${e.targetId}` })
    else if (e.targetType === "week")
      resolved.set(key, { label: `Week of ${formatDate(e.targetId as IsoDate)}`, href: "/admin/market-data" })
    else if (e.targetType === "invite") resolved.set(key, { label: e.targetId, href: "/admin/members" })
    else if (e.targetType === "settings" || e.targetType === "config")
      resolved.set(key, {
        label: SETTINGS_LABELS[e.targetId] ?? "Settings",
        href: e.targetId === "leveragedEtfs" ? "/admin/etfs" : "/admin/settings",
      })
    else if (e.targetType === "connection")
      resolved.set(key, { label: "Brokerage connection", href: "/admin/hg-portfolio" })
  }
  const list = [...lookups.entries()]
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100)
    const snaps = await adminDb().getAll(
      ...chunk.map(([, t]) =>
        adminDb()
          .collection(TITLED[t.type]?.collection ?? "")
          .doc(t.id),
      ),
    )
    snaps.forEach((snap, j) => {
      const entry = chunk[j]
      if (!entry) return
      const [key, t] = entry
      const config = TITLED[t.type]
      if (!config) return
      const name = snap.exists ? (snap.get(config.field) as unknown) : null
      resolved.set(
        key,
        typeof name === "string" && name
          ? { label: name, href: config.href(t.id) }
          : { label: `${config.noun} (deleted)`, href: null },
      )
    })
  }
  return resolved
}

/** The latest run of each scheduled job. */
export async function latestJobRuns(): Promise<JobRun[]> {
  const snap = await adminDb().collection(COLLECTIONS.jobRuns).orderBy("startedAt", "desc").limit(200).get()
  const latest = new Map<string, JobRun>()
  for (const d of snap.docs) {
    const run = parseDoc(jobRunSchema, d.id, d.data())
    if (run && !latest.has(run.job)) latest.set(run.job, run)
  }
  return [...latest.values()].sort((a, b) => a.job.localeCompare(b.job))
}
