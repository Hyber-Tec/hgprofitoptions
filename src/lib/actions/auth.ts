"use server"

import { COLLECTIONS, inviteSchema, parseDoc } from "@/server/model"
import { hashToken } from "@/lib/auth/tokens"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

/**
 * If someone created a login for an invited email without the invite (it cannot be used without
 * the invite token), the real member's password setup would fail with "email already in use".
 * With a valid invite token this removes that orphaned login so the member can continue.
 */
export async function clearOrphanedInviteLogin(inviteToken: string): Promise<{ ok: boolean }> {
  if (typeof inviteToken !== "string" || inviteToken.length < 10) return { ok: false }
  const snap = await adminDb().collection(COLLECTIONS.invites).where("tokenHash", "==", hashToken(inviteToken)).where("status", "==", "pending").limit(1).get()
  const doc = snap.docs[0]
  const invite = doc ? parseDoc(inviteSchema, doc.id, doc.data()) : null
  if (!invite || invite.expiresAt.getTime() < Date.now()) return { ok: false }
  try {
    const user = await adminAuth().getUserByEmail(invite.email)
    const member = await adminDb().collection(COLLECTIONS.members).doc(user.uid).get()
    if (member.exists) return { ok: false }
    await adminAuth().deleteUser(user.uid)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
