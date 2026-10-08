/**
 * Member invitations, shared by the admin console and scripts (no Next.js imports).
 * An invite is keyed by the lowercased email. Only the SHA-256 hash of its token is stored.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { IsoDate, Role } from "@/core/domain/types"
import { findOverlap } from "@/core/membership/quarters"
import { writeAudit } from "./members"
import { COLLECTIONS, inviteSchema, parseDoc, type Invite } from "./model"
import { newToken } from "./tokens"

export const INVITE_TTL_DAYS = 14

export interface InvitePeriod {
  start: IsoDate
  end: IsoDate
  kind: "quarterly" | "custom"
  label: string
  note?: string | null
}

export interface InviteInput {
  email: string
  fullName: string
  role: Role
  phone?: string | null
  whatsapp?: string | null
  location?: string | null
  timezone?: string
  notes?: string | null
  periods: InvitePeriod[]
}

export interface Actor {
  uid: string | null
  email: string | null
}

export class InviteConflictError extends Error {}

export function inviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/welcome?invite=${encodeURIComponent(token)}`
}

export async function readInvite(db: Firestore, email: string): Promise<Invite | null> {
  const snap = await db.collection(COLLECTIONS.invites).doc(email.trim().toLowerCase()).get()
  return snap.exists ? parseDoc(inviteSchema, snap.id, snap.data()) : null
}

/**
 * Creates (or replaces a pending) invite and returns the one-time token for the invite link.
 * Fails when the email already belongs to a member or the periods overlap each other.
 */
export async function createInvite(
  db: Firestore,
  input: InviteInput,
  actor: Actor,
): Promise<{ token: string; expiresAt: Date }> {
  const emailLower = input.email.trim().toLowerCase()
  const sorted = [...input.periods].sort((a, b) => a.start.localeCompare(b.start))
  for (const [i, period] of sorted.entries()) {
    const clash = findOverlap(period, sorted.slice(0, i))
    if (clash) throw new InviteConflictError(`${period.label} overlaps ${clash.label}.`)
  }

  const existingMember = await db.collection(COLLECTIONS.members).where("emailLower", "==", emailLower).limit(1).get()
  if (!existingMember.empty) throw new InviteConflictError("This email already belongs to a member.")

  const { token, hash } = newToken()
  const now = Timestamp.now()
  const expiresAt = new Date(now.toMillis() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const ref = db.collection(COLLECTIONS.invites).doc(emailLower)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists && snap.get("status") === "accepted")
      throw new InviteConflictError("This invitation was already accepted.")
    tx.set(ref, {
      email: input.email.trim(),
      fullName: input.fullName.trim(),
      role: input.role,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      location: input.location ?? null,
      timezone: input.timezone ?? "America/New_York",
      notes: input.notes ?? null,
      periods: sorted.map((p) => ({ start: p.start, end: p.end, kind: p.kind, label: p.label, note: p.note ?? null })),
      tokenHash: hash,
      status: "pending",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: now,
      createdBy: actor.uid,
      acceptedUid: null,
      acceptedAt: null,
    })
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "invite.created",
    targetType: "invite",
    targetId: emailLower,
    detail: { role: input.role, periods: sorted.map((p) => p.label) },
  })
  return { token, expiresAt }
}

/** Issues a fresh token for a pending invite (the old link stops working). */
export async function renewInviteToken(
  db: Firestore,
  email: string,
  actor: Actor,
): Promise<{ token: string; expiresAt: Date }> {
  const ref = db.collection(COLLECTIONS.invites).doc(email.trim().toLowerCase())
  const { token, hash } = newToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new InviteConflictError("This invitation no longer exists.")
    if (snap.get("status") !== "pending") throw new InviteConflictError("Only pending invitations can be resent.")
    tx.update(ref, { tokenHash: hash, expiresAt: Timestamp.fromDate(expiresAt) })
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "invite.renewed",
    targetType: "invite",
    targetId: ref.id,
  })
  return { token, expiresAt }
}

export async function revokeInvite(db: Firestore, email: string, actor: Actor): Promise<void> {
  const ref = db.collection(COLLECTIONS.invites).doc(email.trim().toLowerCase())
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists || snap.get("status") !== "pending")
      throw new InviteConflictError("Only pending invitations can be cancelled.")
    tx.update(ref, { status: "revoked" })
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: "invite.revoked",
    targetType: "invite",
    targetId: ref.id,
  })
}
