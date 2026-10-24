/**
 * Member notifications other than alerts: new strike targets, class recaps, class and membership reminders.
 * Shared by Cloud Functions (scheduled and triggered) and, in local development, the web server.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { addDays, daysBetween, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatDate } from "@/core/format"
import { hasAccess, membershipStatus } from "@/core/membership/quarters"
import { formatDayIn, formatTimeIn, nextOccurrence, zoneAbbreviation, type ClassSession } from "@/core/schedule"
import { layout, sendEmail, sendEmailBatch, type EmailConfig } from "./email"
import { readPeriods, toMembershipPeriods } from "./members"
import {
  COLLECTIONS,
  DEFAULT_SITE_SETTINGS,
  memberSchema,
  memberSettingsSchema,
  parseDoc,
  siteSettingsSchema,
  type Member,
} from "./model"
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

/** "Class recap is ready" to members with access who keep that notification on. */
export async function notifyClassRecap(
  db: Firestore,
  messaging: Messaging,
  recap: { id: string; title: string; date: IsoDate },
): Promise<number> {
  const today = todayInMarketZone()
  const recipients = (await activeMembers(db, today))
    .filter(({ member, status }) => hasAccess(status) && member.prefs.classRecaps)
    .map(({ member }) => member.uid)
  const result = await sendToMembers(db, messaging, recipients, {
    title: "Class recap is ready",
    body: `${recap.title}, ${formatDate(recap.date)}: the key points, tickers and questions.`,
    url: `/members/classroom/recaps/${recap.id}`,
    tag: `recap-${recap.id}`,
  })
  return result.sent
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

const ET = "America/New_York"

/** "today at 7:00 PM ET", "tomorrow at 9:30 AM ET" or "Tue, Oct 27 at 9:30 AM ET". */
function whenText(start: Date, now: Date): string {
  const day = formatDayIn(start, ET)
  const time = `${formatTimeIn(start, ET)} ET`
  if (day === formatDayIn(now, ET)) return `today at ${time}`
  if (day === formatDayIn(new Date(now.getTime() + 86_400_000), ET)) return `tomorrow at ${time}`
  return `${day} at ${time}`
}

/** The reminder's id for one occurrence of a class: the same class at the same time is reminded once. */
const reminderId = (date: IsoDate, session: ClassSession) =>
  `${date}-${session.start.replace(":", "")}-${session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 120)

/**
 * A reminder before each class with the Zoom link, by notification and (when set up) by email, to the
 * members the class is for who keep class reminders on. Runs every few minutes; a document per class
 * occurrence makes sure each one is sent once. Returns the classes reminded and to how many members.
 */
export async function sendClassReminders(
  db: Firestore,
  messaging: Messaging,
  email: EmailConfig | null,
  siteUrl: string,
  now: Date = new Date(),
): Promise<{ title: string; date: IsoDate; members: number }[]> {
  const [siteSnap, membersSnap] = await Promise.all([
    db.collection(COLLECTIONS.settings).doc("site").get(),
    db.collection(COLLECTIONS.settings).doc("members").get(),
  ])
  const site = siteSnap.exists
    ? (parseDoc(siteSettingsSchema, "site", siteSnap.data()) ?? DEFAULT_SITE_SETTINGS)
    : DEFAULT_SITE_SETTINGS
  const lead = site.classReminderMinutes
  if (lead === null) return []
  const zoomUrl = parseDoc(memberSettingsSchema, "members", membersSnap.data() ?? {})?.zoomUrl ?? null
  const due = site.classSchedule
    .map((session) => ({ session, next: nextOccurrence(session, now) }))
    .filter(({ next }) => {
      const until = next.start.getTime() - now.getTime()
      return until > 0 && until <= lead * 60_000
    })
  if (due.length === 0) return []

  const today = todayInMarketZone(now)
  const members = (await activeMembers(db, today)).filter(
    ({ member, status }) => hasAccess(status) && member.prefs.classReminders,
  )
  const classroomUrl = `${siteUrl.replace(/\/+$/, "")}/members/classroom`
  const reminded: { title: string; date: IsoDate; members: number }[] = []
  for (const { session, next } of due) {
    try {
      await db
        .collection(COLLECTIONS.classReminders)
        .doc(reminderId(next.date, session))
        .create({ date: next.date, title: session.title, sentAt: Timestamp.now() })
    } catch {
      continue // Already reminded (or being reminded by another run).
    }
    const recipients = members
      .filter(
        ({ member }) => session.audience === "everyone" || (member.role === "member" && member.level === "beginner"),
      )
      .map(({ member }) => member)
    const when = whenText(next.start, now)
    const title = `${session.title} ${when}`
    await sendToMembers(
      db,
      messaging,
      recipients.map((m) => m.uid),
      {
        title,
        body: zoomUrl ? "Tap to open the classroom and join on Zoom." : "Tap to open the classroom.",
        url: "/members/classroom",
        tag: `class-${reminderId(next.date, session)}`,
      },
    )
    if (email) {
      await sendEmailBatch(
        email,
        recipients.map((m) => {
          const local =
            m.timezone === ET
              ? ""
              : ` That is ${formatTimeIn(next.start, m.timezone)} ${zoneAbbreviation(next.start, m.timezone)} your time.`
          const { html, text } = layout({
            heading: `${session.title} starts ${when}`,
            paragraphs: [
              `${session.note ? `${session.note}. ` : ""}It runs until ${formatTimeIn(next.end, ET)} ET.${local}`,
              zoomUrl
                ? "Join on Zoom with the button below, or from the Classroom page."
                : "Join from the Classroom page.",
            ],
            cta: { label: zoomUrl ? "Join on Zoom" : "Open the classroom", href: zoomUrl ?? classroomUrl },
            footer: "You get this because class reminders are on. Turn them off in Settings, Notifications.",
          })
          return { to: m.email, subject: title, html, text }
        }),
      )
    }
    reminded.push({ title: session.title, date: next.date, members: recipients.length })
  }
  return reminded
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
