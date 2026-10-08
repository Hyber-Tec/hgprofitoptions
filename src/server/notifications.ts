/**
 * Member notifications other than alerts: new strike targets and membership reminders.
 * Shared by Cloud Functions (scheduled and triggered) and, in local development, the web server.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { addDays, daysBetween, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatDate } from "@/core/format"
import { hasAccess, membershipStatus } from "@/core/membership/quarters"
import { layout, sendEmail, sendEmailBatch, type EmailConfig } from "./email"
import { readPeriods, toMembershipPeriods } from "./members"
import { COLLECTIONS, memberSchema, parseDoc, type Member } from "./model"
import { sendToMembers } from "./push"

async function activeMembers(
  db: Firestore,
  today: IsoDate,
): Promise<{ member: Member; status: ReturnType<typeof membershipStatus> }[]> {
  const snap = await db.collection(COLLECTIONS.members).where("status", "==", "active").get()
  const out: { member: Member; status: ReturnType<typeof membershipStatus> }[] = []
  for (const doc of snap.docs) {
    const parsed = parseDoc(memberSchema, doc.id, doc.data())
    if (!parsed) continue
    const member: Member = { ...parsed, uid: doc.id }
    const status = membershipStatus({
      role: member.role,
      status: member.status,
      periods: toMembershipPeriods(await readPeriods(db, doc.id)),
      today,
    })
    out.push({ member, status })
  }
  return out
}

/** "New strike targets are live" to members with access who keep that notification on. */
export async function notifyTargetsPublished(
  db: Firestore,
  messaging: Messaging,
  effectiveDate: IsoDate,
  revision: number,
): Promise<number> {
  const today = todayInMarketZone()
  const recipients = (await activeMembers(db, today))
    .filter(({ member, status }) => hasAccess(status) && member.prefs.targetsPublished)
    .map(({ member }) => member.uid)
  const result = await sendToMembers(db, messaging, recipients, {
    title: revision > 1 ? "Strike targets corrected" : "New strike targets are live",
    body:
      revision > 1
        ? `The ${formatDate(effectiveDate)} update was corrected. Open it to see what changed.`
        : `HG's ${formatDate(effectiveDate)} update is ready.`,
    url: "/members/targets",
    tag: `targets-${effectiveDate}`,
  })
  return result.sent
}

/**
 * Sends "new strike targets" once per published revision, however many times the trigger fires.
 * Returns how many members were notified, or null when there was nothing to send.
 */
export async function notifyTargetsOnce(
  db: Firestore,
  messaging: Messaging,
  effectiveDate: IsoDate,
  claimId: string,
): Promise<number | null> {
  const ref = db.collection(COLLECTIONS.targetUpdates).doc(effectiveDate)
  const revision = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists || snap.get("status") !== "published" || snap.get("notify") !== true) return null
    const current = (snap.get("revision") as number | undefined) ?? 1
    const claim = snap.get("notifyClaim") as { revision: number; id: string } | undefined
    if (claim && claim.revision === current && claim.id !== claimId) return null
    tx.update(ref, { notifyClaim: { revision: current, id: claimId, at: Timestamp.now() } })
    return current
  })
  return revision === null ? null : notifyTargetsPublished(db, messaging, effectiveDate, revision)
}

/**
 * Membership reminders 14 and 3 days before the end of a member's current stretch, by browser
 * notification and email. Run once a day.
 */
export async function sendMembershipReminders(
  db: Firestore,
  messaging: Messaging,
  email: EmailConfig | null,
  siteUrl: string,
): Promise<number> {
  const today = todayInMarketZone()
  let sent = 0
  for (const { member, status } of await activeMembers(db, today)) {
    if (member.role !== "member" || status.kind !== "active" || !member.prefs.membershipReminders) continue
    const days = daysBetween(today, status.coverageEnd)
    if (days !== 14 && days !== 3) continue
    const title = `Your membership ends ${formatDate(status.coverageEnd)}`
    const body =
      days === 3
        ? "Three days left. Book a quick call with HG to renew for next quarter."
        : "Two weeks left in your quarter. Book a quick call with HG to renew."
    await sendToMembers(db, messaging, [member.uid], {
      title,
      body,
      url: "/members",
      tag: `renewal-${status.coverageEnd}`,
    })
    if (email) {
      const { html, text } = layout({
        heading: title,
        paragraphs: [body, "Your journal and portfolio stay yours either way."],
        cta: { label: "Book a call", href: `${siteUrl}/book` },
      })
      await sendEmail(email, { to: member.email, subject: title, html, text }).catch((error: unknown) =>
        console.error("reminder email", error),
      )
    }
    sent++
  }
  return sent
}

/** Members whose membership ended yesterday, for the admin digest. */
export async function expiredYesterday(db: Firestore): Promise<Member[]> {
  const today = todayInMarketZone()
  const yesterday = addDays(today, -1)
  return (await activeMembers(db, today))
    .filter(
      ({ member, status }) => member.role === "member" && status.kind === "expired" && status.last.end === yesterday,
    )
    .map(({ member }) => member)
}

/** Emails the admins the members whose membership ended yesterday, so nobody is forgotten. */
export async function emailAdminsExpired(db: Firestore, email: EmailConfig | null, siteUrl: string): Promise<number> {
  const expired = await expiredYesterday(db)
  if (expired.length === 0 || !email) return 0
  const admins = await db.collection(COLLECTIONS.members).where("role", "==", "admin").get()
  const heading =
    expired.length === 1 ? "1 membership ended yesterday" : `${expired.length} memberships ended yesterday`
  const { html, text } = layout({
    heading,
    paragraphs: [
      expired.map((m) => m.fullName).join(", "),
      "They can still sign in to see their journal and portfolio. Renew them from Members when they pay for the next quarter.",
    ],
    cta: { label: "Open Members", href: `${siteUrl.replace(/\/+$/, "")}/admin/members?status=expired` },
    footer: "Sent to HG Profit Options admins.",
  })
  return sendEmailBatch(
    email,
    admins.docs
      .map((d) => d.get("email") as string | undefined)
      .filter((to): to is string => Boolean(to))
      .map((to) => ({ to, subject: heading, html, text })),
  )
}
