/**
 * Browser push delivery through Firebase Cloud Messaging, shared by the web app and Cloud Functions.
 * Browsers register by Firebase Installation ID (FID), stored in the `token` field of a device record.
 * Messages are data-only; the service worker (src/sw) renders them.
 */
import { createHash } from "node:crypto"
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, fcmTokenSchema, parseDoc, type FcmTokenDoc } from "./model"

export interface PushMessage {
  title: string
  body: string
  /** Path the notification opens, e.g. /members/alerts/abc. */
  url: string
  tag?: string
  alertId?: string
}

export const tokenId = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 40)

export async function readTokens(db: Firestore, uid: string): Promise<FcmTokenDoc[]> {
  const snap = await db.collection(COLLECTIONS.members).doc(uid).collection(MEMBER_SUBCOLLECTIONS.fcmTokens).get()
  return snap.docs.map((d) => parseDoc(fcmTokenSchema, d.id, d.data())).filter((t): t is FcmTokenDoc => t !== null)
}

export async function saveToken(
  db: Firestore,
  uid: string,
  input: { token: string; userAgent: string | null; sessionId: string | null },
): Promise<void> {
  const ref = db
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.fcmTokens)
    .doc(tokenId(input.token))
  const now = Timestamp.now()
  const existing = await ref.get()
  await ref.set({
    token: input.token,
    userAgent: input.userAgent,
    sessionId: input.sessionId,
    lastSeenAt: now,
    createdAt: existing.exists ? (existing.get("createdAt") as Timestamp) : now,
  })
}

export async function deleteToken(db: Firestore, uid: string, token: string): Promise<void> {
  await db
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.fcmTokens)
    .doc(tokenId(token))
    .delete()
}

/**
 * Sends one message to many members' devices. Tokens that FCM reports as gone are deleted.
 * Returns counts for the delivery stats.
 */
export async function sendToMembers(
  db: Firestore,
  messaging: Messaging,
  uids: readonly string[],
  message: PushMessage,
): Promise<{ queued: number; sent: number; failed: number }> {
  const targets: { uid: string; token: string }[] = []
  for (const uid of uids) for (const t of await readTokens(db, uid)) targets.push({ uid, token: t.token })
  let sent = 0
  let failed = 0
  for (let i = 0; i < targets.length; i += 500) {
    const batch = targets.slice(i, i + 500)
    const response = await messaging.sendEachForMulticast({
      fids: batch.map((t) => t.token),
      data: {
        title: message.title,
        body: message.body,
        url: message.url,
        tag: message.tag ?? message.alertId ?? "hg",
        ...(message.alertId ? { alertId: message.alertId } : {}),
      },
      webpush: { headers: { Urgency: "high", TTL: String(24 * 60 * 60) } },
    })
    sent += response.successCount
    failed += response.failureCount
    await Promise.all(
      response.responses.map(async (r, j) => {
        const target = batch[j]
        const code = r.error?.code ?? ""
        // The browser unregistered or the installation expired: stop sending to it.
        if (target && /not-registered|invalid-registration|invalid-argument/.test(code))
          await deleteToken(db, target.uid, target.token)
      }),
    )
  }
  return { queued: targets.length, sent, failed }
}
