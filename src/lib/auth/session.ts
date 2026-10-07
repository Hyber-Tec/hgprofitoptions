import "server-only"
import { randomUUID } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import { cookies } from "next/headers"
import { cache } from "react"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, memberSettingsSchema, type Member } from "@/server/model"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { ensureMember } from "./ensure-member"

/** Firebase Hosting and App Hosting only forward a cookie named __session to the server. */
export const SESSION_COOKIE = "__session"
const SESSION_DAYS = 5
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
const RECENT_SIGN_IN_SECONDS = 5 * 60

export interface SessionInfo {
  uid: string
  sid: string
  email: string | null
  /** True when this session was created after a second-factor (TOTP) sign-in. */
  mfa: boolean
}

export async function sessionLimit(): Promise<number> {
  const snap = await adminDb().collection(COLLECTIONS.settings).doc("members").get()
  const parsed = memberSettingsSchema.safeParse(snap.data() ?? {})
  return parsed.success ? parsed.data.sessionLimit : 2
}

/**
 * Exchanges a fresh Firebase ID token for a server session cookie.
 * Each session also gets a Firestore record so the per-member session limit can sign out the oldest one.
 */
export async function createSession(input: {
  idToken: string
  inviteToken?: string
  acceptTerms?: boolean
  userAgent: string | null
  ip: string | null
}): Promise<{ cookieValue: string; maxAgeSeconds: number; member: Member }> {
  const auth = adminAuth()
  const decoded = await auth.verifyIdToken(input.idToken, true)
  if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_SECONDS)
    throw new Error("Sign-in is too old. Please sign in again.")

  const member = await ensureMember(decoded, {
    ...(input.inviteToken ? { inviteToken: input.inviteToken } : {}),
    ...(input.acceptTerms ? { acceptTerms: true } : {}),
  })
  const sessionCookie = await auth.createSessionCookie(input.idToken, { expiresIn: SESSION_MS })

  const db = adminDb()
  const memberRef = db.collection(COLLECTIONS.members).doc(decoded.uid)
  const sessions = memberRef.collection(MEMBER_SUBCOLLECTIONS.sessions)
  const sid = randomUUID()
  const now = Timestamp.now()
  await sessions.doc(sid).set({
    createdAt: now,
    lastSeenAt: now,
    expiresAt: Timestamp.fromMillis(Date.now() + SESSION_MS),
    userAgent: input.userAgent,
    ip: input.ip,
  })
  await memberRef
    .collection(MEMBER_SUBCOLLECTIONS.logins)
    .add({ at: now, ip: input.ip, userAgent: input.userAgent, provider: decoded.firebase.sign_in_provider })
  await memberRef.update({ lastLoginAt: now })

  // Enforce the session limit: keep the newest N sessions.
  const limit = await sessionLimit()
  const all = await sessions.orderBy("createdAt", "desc").get()
  await Promise.all(all.docs.slice(limit).map((d) => d.ref.delete()))

  return { cookieValue: `${sid}:${sessionCookie}`, maxAgeSeconds: SESSION_MS / 1000, member }
}

function parseCookie(value: string | undefined): { sid: string; jwt: string } | null {
  if (!value) return null
  const split = value.indexOf(":")
  if (split <= 0) return null
  return { sid: value.slice(0, split), jwt: value.slice(split + 1) }
}

/** The verified session for this request, or null. Cached per request. */
export const readSession = cache(async (): Promise<SessionInfo | null> => {
  const store = await cookies()
  const parsed = parseCookie(store.get(SESSION_COOKIE)?.value)
  if (!parsed) return null
  try {
    const decoded = await adminAuth().verifySessionCookie(parsed.jwt, true)
    const ref = adminDb()
      .collection(COLLECTIONS.members)
      .doc(decoded.uid)
      .collection(MEMBER_SUBCOLLECTIONS.sessions)
      .doc(parsed.sid)
    const session = await ref.get()
    if (!session.exists) return null
    const lastSeen = session.get("lastSeenAt") as Timestamp | undefined
    if (!lastSeen || Date.now() - lastSeen.toMillis() > 10 * 60 * 1000)
      await ref.update({ lastSeenAt: Timestamp.now() })
    return {
      uid: decoded.uid,
      sid: parsed.sid,
      email: decoded.email ?? null,
      mfa: Boolean(decoded.firebase.sign_in_second_factor),
    }
  } catch {
    return null
  }
})

/** Removes this browser's session record. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const parsed = parseCookie(store.get(SESSION_COOKIE)?.value)
  if (!parsed) return
  try {
    const decoded = await adminAuth().verifySessionCookie(parsed.jwt, false)
    await adminDb()
      .collection(COLLECTIONS.members)
      .doc(decoded.uid)
      .collection(MEMBER_SUBCOLLECTIONS.sessions)
      .doc(parsed.sid)
      .delete()
  } catch {
    // An invalid or expired cookie has no session to remove.
  }
}

/** Signs a member out everywhere: revokes Firebase refresh tokens and deletes every session record. */
export async function revokeAllSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid)
  const sessions = await adminDb()
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.sessions)
    .get()
  await Promise.all(sessions.docs.map((d) => d.ref.delete()))
}
