"use server"

import { createHash } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import { headers } from "next/headers"
import { z } from "zod"
import { todayInMarketZone } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { trialPeriod } from "@/core/membership/quarters"
import { InviteConflictError, createInvite, readInvite } from "@/server/invites"
import { COLLECTIONS } from "@/server/model"
import { getSiteSettings } from "@/lib/data/public"
import { adminDb } from "@/lib/firebase/admin"

/** Free trials one network can start in a day, so nobody fills the member list with throwaway accounts. */
const TRIALS_PER_DAY = 5

const trialInput = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.email("Enter a valid email address").transform((v) => v.trim().toLowerCase()),
  /** A field people never see; forms that fill it in are bots. */
  website: z.string().max(0).optional(),
})

/** Counts trial starts per network and day; false once the day's limit is reached. */
async function allowStart(ip: string | null): Promise<boolean> {
  const today = todayInMarketZone()
  const id = createHash("sha256")
    .update(`${ip ?? "unknown"}|${today}`)
    .digest("hex")
    .slice(0, 40)
  const ref = adminDb().collection(COLLECTIONS.trialStarts).doc(id)
  return adminDb().runTransaction(async (tx) => {
    const count = ((await tx.get(ref)).get("count") as number | undefined) ?? 0
    if (count >= TRIALS_PER_DAY) return false
    tx.set(ref, { count: count + 1, date: today, updatedAt: Timestamp.now() })
    return true
  })
}

/**
 * Starts a free trial: an invitation for the visitor's email with a trial period, whose link they open
 * right away to create their login (the usual welcome page). The member area then opens with HG's
 * newest posts held back until the trial becomes a membership.
 */
export async function startTrial(input: z.input<typeof trialInput>): Promise<ActionResult<{ token: string }>> {
  const { trial } = await getSiteSettings()
  if (!trial.enabled)
    return {
      ok: false,
      code: "forbidden",
      message: "Free trials are paused right now. Book a free call with HG to see the member area.",
    }
  const parsed = trialInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const { fullName, email } = parsed.data

  const db = adminDb()
  const member = await db.collection(COLLECTIONS.members).where("emailLower", "==", email).limit(1).get()
  const invite = await readInvite(db, email)
  if (!member.empty || invite?.status === "accepted")
    return { ok: false, code: "conflict", message: "This email already has an account. Log in with it instead." }
  if (invite?.status === "pending" && !invite.trial && invite.expiresAt.getTime() > Date.now())
    return {
      ok: false,
      code: "conflict",
      message: "HG already sent an invitation to this email. Open the link in it, or ask HG to send it again.",
    }

  const forwarded = (await headers()).get("x-forwarded-for")
  if (!(await allowStart(forwarded?.split(",")[0]?.trim() ?? null)))
    return {
      ok: false,
      code: "unavailable",
      message: "Too many trials were started from this network today. Try again tomorrow, or book a free call.",
    }

  try {
    const { token } = await createInvite(
      db,
      { email, fullName, role: "member", periods: [trialPeriod(todayInMarketZone(), trial.days)], trial: true },
      { uid: null, email },
    )
    return { ok: true, data: { token } }
  } catch (error) {
    if (error instanceof InviteConflictError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
}
