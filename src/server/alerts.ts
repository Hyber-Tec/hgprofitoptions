/**
 * Alert lifecycle and delivery, shared by the admin console and Cloud Functions.
 *
 * Draft → (scheduled →) published → closed. Published alerts are never changed silently: an edit
 * archives the previous version under alerts/{id}/revisions and marks the alert as edited.
 * Exits (from sell follow-ups or a direct close) accumulate on the root alert; when the portions
 * reach 100% the alert closes and its result is computed from the published buy and sell points.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { alertNotification } from "@/core/alerts"
import { alertReturn } from "@/core/calc/standing"
import { todayInMarketZone } from "@/core/dates"
import { hasAccess, membershipStatus } from "@/core/membership/quarters"
import { readPeriods, toMembershipPeriods, writeAudit } from "./members"
import { COLLECTIONS, REVISIONS, alertSchema, memberSchema, parseDoc, type AlertDoc } from "./model"
import { sendToMembers } from "./push"

export class AlertStateError extends Error {}

const alerts = (db: Firestore) => db.collection(COLLECTIONS.alerts)

export async function readAlert(db: Firestore, id: string): Promise<AlertDoc | null> {
  const snap = await alerts(db).doc(id).get()
  return snap.exists ? parseDoc(alertSchema, snap.id, snap.data()) : null
}

export interface Actor {
  uid: string
  email: string | null
}

/** Publishes a draft now, or schedules it. Scheduled alerts are published by a job when due. */
export async function publishAlert(db: Firestore, id: string, actor: Actor, publishAt: Date | null): Promise<void> {
  const ref = alerts(db).doc(id)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const status = snap.get("status") as string | undefined
    if (status !== "draft" && status !== "scheduled")
      throw new AlertStateError("Only drafts and scheduled alerts can be published.")
    if (publishAt && publishAt.getTime() > Date.now() + 30_000) {
      tx.update(ref, { status: "scheduled", publishAt: Timestamp.fromDate(publishAt) })
    } else {
      tx.update(ref, { status: "published", publishAt: null, publishedAt: Timestamp.now() })
    }
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: publishAt ? "alert.scheduled" : "alert.published",
    targetType: "alert",
    targetId: id,
    detail: publishAt ? { publishAt: publishAt.toISOString() } : undefined,
  })
}

/** Publishes every scheduled alert that is due. Returns the ids. */
export async function publishDueAlerts(db: Firestore): Promise<string[]> {
  const due = await alerts(db).where("status", "==", "scheduled").where("publishAt", "<=", Timestamp.now()).get()
  const ids: string[] = []
  for (const doc of due.docs) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref)
      if (fresh.get("status") !== "scheduled") return
      tx.update(doc.ref, { status: "published", publishAt: null, publishedAt: Timestamp.now() })
      ids.push(doc.id)
    })
  }
  return ids
}

/** Fields an admin may correct after publishing. */
export interface AlertRevisionInput {
  title: string
  body: string
  buyLow: number | null
  buyHigh: number | null
  sellPoints: number[]
  stop: number | null
  changeNote: string | null
}

export async function reviseAlert(db: Firestore, id: string, input: AlertRevisionInput, actor: Actor): Promise<void> {
  const ref = alerts(db).doc(id)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new AlertStateError("This alert no longer exists.")
    const current = snap.data() ?? {}
    const status = current.status as string
    if (status !== "published" && status !== "closed")
      throw new AlertStateError("Only published alerts are revised. Edit the draft instead.")
    const revision = (current.revision as number | undefined) ?? 1
    tx.set(ref.collection(REVISIONS).doc(String(revision)), {
      ...current,
      replacedAt: Timestamp.now(),
      changeNote: input.changeNote,
    })
    tx.update(ref, {
      title: input.title,
      body: input.body,
      buyLow: input.buyLow,
      buyHigh: input.buyHigh,
      sellPoints: input.sellPoints,
      stop: input.stop,
      edited: true,
      editedAt: Timestamp.now(),
      revision: revision + 1,
    })
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "alert.revised",
    targetType: "alert",
    targetId: id,
    detail: input.changeNote ? { note: input.changeNote } : undefined,
  })
}

export interface ExitInput {
  price: number
  /** Fraction of the original position, 0 to 1. */
  portion: number
}

function applyExits(root: AlertDoc, exits: ExitInput[]) {
  const all = [
    ...root.exits.map((e) => ({ price: e.price, portion: e.portion, at: Timestamp.fromDate(e.at) })),
    ...exits.map((e) => ({ price: e.price, portion: e.portion, at: Timestamp.now() })),
  ]
  const total = all.reduce((s, e) => s + e.portion, 0)
  const closed = total >= 0.999
  const result =
    closed && root.buyLow !== null && root.buyHigh !== null ? alertReturn(root.buyLow, root.buyHigh, all) : null
  return {
    exits: all,
    ...(closed
      ? {
          status: "closed",
          closedAt: Timestamp.now(),
          resultPct: result === null ? null : Math.round(result * 10000) / 10000,
        }
      : {}),
  }
}

/** Records exits on an open alert without posting a follow-up (for example "closed at T2"). */
export async function closeAlert(db: Firestore, id: string, exits: ExitInput[], actor: Actor): Promise<void> {
  const ref = alerts(db).doc(id)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const root = snap.exists ? parseDoc(alertSchema, snap.id, snap.data()) : null
    if (root?.status !== "published") throw new AlertStateError("Only open (published) alerts can be closed.")
    const remaining = 1 - root.exits.reduce((s, e) => s + e.portion, 0)
    if (exits.reduce((s, e) => s + e.portion, 0) > remaining + 0.001)
      throw new AlertStateError(`Only ${Math.round(remaining * 100)}% of this position is still open.`)
    tx.update(ref, applyExits(root, exits))
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "alert.closed",
    targetType: "alert",
    targetId: id,
    detail: { exits },
  })
}

/**
 * Posts a follow-up (sell or update) under an open alert and publishes it right away. A sell with an
 * exit portion also records the exit on the root alert, closing it at 100%.
 */
export async function postFollowUp(
  db: Firestore,
  rootId: string,
  input: { kind: "sell" | "update"; body: string; price: number | null; portion: number | null },
  actor: Actor,
): Promise<string> {
  const rootRef = alerts(db).doc(rootId)
  const followRef = alerts(db).doc()
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rootRef)
    const root = snap.exists ? parseDoc(alertSchema, snap.id, snap.data()) : null
    if (!root || (root.status !== "published" && root.status !== "closed"))
      throw new AlertStateError("Follow-ups can only be posted on published alerts.")
    if (root.parentId !== null) throw new AlertStateError("Post follow-ups on the original alert.")
    const now = Timestamp.now()
    tx.set(followRef, {
      kind: input.kind,
      symbol: root.symbol,
      assetType: root.assetType,
      optionRight: root.optionRight,
      strike: root.strike,
      expiry: root.expiry,
      buyLow: null,
      buyHigh: null,
      sellPoints: input.price !== null ? [input.price] : [],
      stop: null,
      title: root.title,
      body: input.body,
      imagePath: null,
      parentId: rootId,
      targetEntrySymbol: null,
      status: "published",
      publishAt: null,
      publishedAt: now,
      closedAt: null,
      exits: [],
      resultPct: null,
      sendEmail: root.sendEmail,
      delivery: null,
      tookCount: 0,
      edited: false,
      editedAt: null,
      revision: 1,
      createdBy: actor.uid,
      createdAt: now,
    })
    if (
      input.kind === "sell" &&
      input.price !== null &&
      input.portion !== null &&
      input.portion > 0 &&
      root.status === "published"
    ) {
      const remaining = 1 - root.exits.reduce((s, e) => s + e.portion, 0)
      if (input.portion > remaining + 0.001)
        throw new AlertStateError(`Only ${Math.round(remaining * 100)}% of this position is still open.`)
      tx.update(rootRef, applyExits(root, [{ price: input.price, portion: input.portion }]))
    }
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "alert.follow_up",
    targetType: "alert",
    targetId: rootId,
    detail: { followUpId: followRef.id, kind: input.kind },
  })
  return followRef.id
}

export async function cancelAlert(db: Firestore, id: string, actor: Actor): Promise<void> {
  const ref = alerts(db).doc(id)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const status = snap.get("status") as string | undefined
    if (status === "draft") tx.delete(ref)
    else if (status === "scheduled") tx.update(ref, { status: "cancelled", publishAt: null })
    else throw new AlertStateError("Published alerts cannot be removed. Post an update or close it instead.")
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "alert.cancelled",
    targetType: "alert",
    targetId: id,
  })
}

/**
 * Who gets a notification for an alert: members with access right now (admins included), whose
 * preferences include this kind, minus anyone who muted the ticker.
 */
export async function alertRecipients(
  db: Firestore,
  alert: Pick<AlertDoc, "kind" | "symbol">,
  channel: "push" | "email",
): Promise<{ uid: string; email: string; fullName: string }[]> {
  const today = todayInMarketZone()
  const snap = await db.collection(COLLECTIONS.members).where("status", "==", "active").get()
  const recipients: { uid: string; email: string; fullName: string }[] = []
  for (const doc of snap.docs) {
    const member = parseDoc(memberSchema, doc.id, doc.data())
    if (!member) continue
    const kinds = channel === "push" ? member.prefs.pushKinds : member.prefs.emailKinds
    if (!kinds.includes(alert.kind)) continue
    if (alert.symbol && member.prefs.mutedSymbols.includes(alert.symbol)) continue
    if (member.role !== "admin") {
      const status = membershipStatus({
        role: member.role,
        status: member.status,
        periods: toMembershipPeriods(await readPeriods(db, doc.id)),
        today,
      })
      if (!hasAccess(status)) continue
    }
    recipients.push({ uid: doc.id, email: member.email, fullName: member.fullName })
  }
  return recipients
}

/** Members (not admins) with access right now: the people an alert is for. */
export async function audienceSize(db: Firestore): Promise<number> {
  const today = todayInMarketZone()
  const snap = await db
    .collection(COLLECTIONS.members)
    .where("status", "==", "active")
    .where("role", "==", "member")
    .get()
  let count = 0
  for (const doc of snap.docs) {
    const status = membershipStatus({
      role: "member",
      status: "active",
      periods: toMembershipPeriods(await readPeriods(db, doc.id)),
      today,
    })
    if (hasAccess(status)) count++
  }
  return count
}

/** Sends the notifications for a newly published alert and records delivery stats on it. */
export async function deliverAlert(
  db: Firestore,
  messaging: Messaging,
  id: string,
  options: { sendEmail?: (to: { email: string; fullName: string }[], alert: AlertDoc) => Promise<number> } = {},
): Promise<{ queued: number; sent: number; failed: number }> {
  const alert = await readAlert(db, id)
  if (!alert || alert.status !== "published") return { queued: 0, sent: 0, failed: 0 }
  const recipients = await alertRecipients(db, alert, "push")
  const { title, body } = alertNotification(alert)
  const url = `/members/alerts/${alert.parentId ?? alert.id}${alert.parentId ? `?f=${alert.id}` : ""}`
  const push = await sendToMembers(
    db,
    messaging,
    recipients.map((r) => r.uid),
    { title, body, url, tag: alert.parentId ?? alert.id, alertId: alert.id },
  )
  let emailed = 0
  if (options.sendEmail && alert.sendEmail) {
    const emailRecipients = await alertRecipients(db, alert, "email")
    if (emailRecipients.length > 0) emailed = await options.sendEmail(emailRecipients, alert)
  }
  const audience = await audienceSize(db)
  const delivery = {
    audience,
    queued: push.queued + emailed,
    sent: push.sent + emailed,
    failed: push.failed,
    finishedAt: Timestamp.now(),
  }
  await alerts(db).doc(id).update({ delivery })
  return delivery
}
