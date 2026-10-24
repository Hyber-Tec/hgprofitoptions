/**
 * Membership logic shared by the Next.js server and Cloud Functions (no Next.js imports).
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { auditCategory } from "@/core/audit"
import { addDays, todayInMarketZone, zonedStartOfDay } from "@/core/dates"
import type { IsoDate, MembershipPeriod } from "@/core/domain/types"
import { accessWindow, findOverlap } from "@/core/membership/quarters"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, parseDoc, periodSchema, type PeriodDoc } from "./model"

export async function readPeriods(db: Firestore, uid: string): Promise<PeriodDoc[]> {
  const snap = await db
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.periods)
    .orderBy("start")
    .get()
  return snap.docs.map((d) => parseDoc(periodSchema, d.id, d.data())).filter((p): p is PeriodDoc => p !== null)
}

export function toMembershipPeriods(periods: readonly PeriodDoc[]): MembershipPeriod[] {
  return periods.map((p) => ({ id: p.id, start: p.start, end: p.end, kind: p.kind, label: p.label, note: p.note }))
}

/**
 * The access window document field, or null when there is no current or upcoming period. `trial` is set
 * while a free trial is all that covers today, so the security rules hold back HG's newest posts.
 */
export function accessField(periods: readonly Pick<MembershipPeriod, "start" | "end" | "kind">[], today: IsoDate) {
  const window = accessWindow(periods, today)
  if (!window) return null
  const covers = (p: Pick<MembershipPeriod, "start" | "end">) => p.start <= today && today <= p.end
  return {
    from: Timestamp.fromDate(zonedStartOfDay(window.from)),
    until: Timestamp.fromDate(zonedStartOfDay(window.untilExclusive)),
    fromDate: window.from,
    untilExclusiveDate: window.untilExclusive,
    trial:
      !periods.some((p) => p.kind !== "trial" && covers(p)) && periods.some((p) => p.kind === "trial" && covers(p)),
  }
}

/**
 * Recomputes the denormalized access window (read by Firestore security rules) and "member since".
 * Called after every period change and nightly, so a later block takes over after a gap.
 */
export async function recomputeAccess(db: Firestore, uid: string, today: IsoDate = todayInMarketZone()): Promise<void> {
  const periods = await readPeriods(db, uid)
  // A free trial is not membership yet: "member since" starts with the first paid period.
  const first = periods.find((p) => p.kind !== "trial")
  await db
    .collection(COLLECTIONS.members)
    .doc(uid)
    .update({ access: accessField(periods, today), memberSince: first ? first.start : null })
}

/** Nightly: every member's access window, so a new quarter (or a lapsed one) takes effect in the rules. */
export async function refreshAllAccess(db: Firestore, today: IsoDate = todayInMarketZone()): Promise<number> {
  const members = await db.collection(COLLECTIONS.members).select().get()
  for (const doc of members.docs) await recomputeAccess(db, doc.id, today)
  return members.size
}

export class OverlapError extends Error {
  constructor(public readonly existing: { label: string; start: string; end: string }) {
    super(`This overlaps ${existing.label} (${existing.start} to ${existing.end}).`)
  }
}

/**
 * Adds a period inside a transaction so two admins cannot create overlapping periods at once. A free trial
 * that runs into the new period ends the day before it (or goes, if it had not started yet): joining
 * replaces the trial.
 */
export async function addPeriod(
  db: Firestore,
  uid: string,
  period: { start: IsoDate; end: IsoDate; kind: "quarterly" | "custom"; label: string; note?: string | null },
  actorUid: string | null,
): Promise<string> {
  const periodsRef = db.collection(COLLECTIONS.members).doc(uid).collection(MEMBER_SUBCOLLECTIONS.periods)
  const id = await db.runTransaction(async (tx) => {
    const snap = await tx.get(periodsRef)
    const existing = snap.docs
      .map((d) => parseDoc(periodSchema, d.id, d.data()))
      .filter((p): p is PeriodDoc => p !== null)
    const overlap = findOverlap(
      period,
      existing.filter((p) => p.kind !== "trial"),
    )
    if (overlap) throw new OverlapError(overlap)
    for (const trial of existing.filter((p) => p.kind === "trial" && p.end >= period.start && p.start <= period.end)) {
      if (trial.start >= period.start) tx.delete(periodsRef.doc(trial.id))
      else tx.update(periodsRef.doc(trial.id), { end: addDays(period.start, -1) })
    }
    const ref = periodsRef.doc()
    tx.set(ref, { ...period, note: period.note ?? null, createdAt: Timestamp.now(), createdBy: actorUid })
    return ref.id
  })
  await recomputeAccess(db, uid)
  return id
}

export async function writeAudit(
  db: Firestore,
  entry: {
    actorUid: string | null
    actorEmail: string | null
    action: string
    targetType: string
    targetId: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await db
    .collection(COLLECTIONS.auditLog)
    .add({ ...entry, category: auditCategory(entry.action), detail: entry.detail ?? null, createdAt: Timestamp.now() })
}
