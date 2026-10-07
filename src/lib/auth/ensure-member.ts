import "server-only"
import type { DecodedIdToken } from "firebase-admin/auth"
import { Timestamp } from "firebase-admin/firestore"
import { recomputeAccess, writeAudit } from "@/server/members"
import {
  COLLECTIONS,
  DEFAULT_PREFS,
  MEMBER_SUBCOLLECTIONS,
  inviteSchema,
  memberSchema,
  parseDoc,
  type Member,
} from "@/server/model"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { tokenMatches } from "@/server/tokens"

export class AccessError extends Error {
  constructor(
    public readonly code: "not-invited" | "suspended" | "invite-expired" | "invite-token-required",
    message: string,
  ) {
    super(message)
  }
}

/**
 * Returns the member for a verified ID token, creating it from a pending invite on first sign-in.
 * Google accounts prove email ownership themselves; password accounts must present the invite token.
 */
export async function ensureMember(
  decoded: DecodedIdToken,
  options: { inviteToken?: string; acceptTerms?: boolean },
): Promise<Member> {
  const db = adminDb()
  const memberRef = db.collection(COLLECTIONS.members).doc(decoded.uid)
  const existing = await memberRef.get()
  if (existing.exists) {
    const member = parseDoc(memberSchema, decoded.uid, existing.data())
    if (!member) throw new Error("Member document is invalid")
    if (member.status === "suspended")
      throw new AccessError("suspended", "This account is suspended. Please contact HG.")
    return { ...member, uid: decoded.uid }
  }

  const email = decoded.email?.toLowerCase()
  if (!email) throw new AccessError("not-invited", "This sign-in has no email address.")
  const inviteRef = db.collection(COLLECTIONS.invites).doc(email)
  const inviteSnap = await inviteRef.get()
  const invite = inviteSnap.exists ? parseDoc(inviteSchema, inviteSnap.id, inviteSnap.data()) : null
  if (!invite || invite.status !== "pending") {
    throw new AccessError("not-invited", "This email is not on the member list. Book a call with HG to join.")
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new AccessError("invite-expired", "This invitation has expired. Ask HG for a new link.")
  }
  const provider = decoded.firebase.sign_in_provider
  const emailProven = provider === "google.com" && decoded.email_verified === true
  if (!emailProven && !(options.inviteToken && tokenMatches(options.inviteToken, invite.tokenHash))) {
    throw new AccessError("invite-token-required", "Open your invitation link to create your password.")
  }

  const now = Timestamp.now()
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(inviteRef)
    if (fresh.get("status") !== "pending") throw new AccessError("not-invited", "This invitation was already used.")
    tx.set(memberRef, {
      email: decoded.email ?? invite.email,
      emailLower: email,
      fullName: invite.fullName,
      phone: invite.phone,
      whatsapp: invite.whatsapp,
      location: invite.location,
      timezone: invite.timezone,
      role: invite.role,
      status: "active",
      access: null,
      memberSince: null,
      termsAcceptedAt: options.acceptTerms ? now : null,
      prefs: DEFAULT_PREFS,
      brokerage: { linked: false, status: "none", lastSyncedAt: null },
      stats: null,
      createdAt: now,
      createdBy: invite.createdBy,
      lastLoginAt: now,
    })
    for (const period of invite.periods) {
      tx.set(memberRef.collection(MEMBER_SUBCOLLECTIONS.periods).doc(), {
        ...period,
        createdAt: now,
        createdBy: invite.createdBy,
      })
    }
    tx.update(inviteRef, { status: "accepted", acceptedUid: decoded.uid, acceptedAt: now })
  })

  await recomputeAccess(db, decoded.uid)
  if (invite.role === "admin") await adminAuth().setCustomUserClaims(decoded.uid, { role: "admin" })
  if (provider === "password" && !decoded.email_verified)
    await adminAuth().updateUser(decoded.uid, { emailVerified: true })
  if (invite.notes) {
    await db
      .collection(COLLECTIONS.members)
      .doc(decoded.uid)
      .collection("adminNotes")
      .doc("notes")
      .set({ body: invite.notes, updatedAt: now })
  }
  await writeAudit(db, {
    actorUid: decoded.uid,
    actorEmail: email,
    action: "member.joined",
    targetType: "member",
    targetId: decoded.uid,
    detail: { role: invite.role },
  })

  const created = await memberRef.get()
  const member = parseDoc(memberSchema, decoded.uid, created.data())
  if (!member) throw new Error("Member document is invalid after creation")
  return { ...member, uid: decoded.uid }
}
