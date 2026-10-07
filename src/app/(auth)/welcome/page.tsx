import type { Metadata } from "next"
import Link from "next/link"
import { describePeriodRange } from "@/core/membership/quarters"
import { COLLECTIONS, inviteSchema, parseDoc } from "@/server/model"
import { WelcomeForm } from "@/components/auth/welcome-form"
import { Button } from "@/components/ui/button"
import { hashToken } from "@/lib/auth/tokens"
import { adminDb } from "@/lib/firebase/admin"

export const metadata: Metadata = { title: "Welcome", robots: { index: false } }

async function findInvite(token: string) {
  const snap = await adminDb().collection(COLLECTIONS.invites).where("tokenHash", "==", hashToken(token)).limit(1).get()
  const doc = snap.docs[0]
  const invite = doc ? parseDoc(inviteSchema, doc.id, doc.data()) : null
  return invite ? { invite, expired: invite.expiresAt.getTime() < Date.now() } : null
}

type InviteProblem = "invalid" | "accepted" | "revoked" | "expired"

const PROBLEMS: Record<InviteProblem, { title: string; body: string; action: string }> = {
  invalid: {
    title: "This link is not valid",
    body: "Invitation links only work exactly as sent. Open the full link from your invitation email, or ask HG for a new one.",
    action: "Go to member login",
  },
  accepted: {
    title: "You already joined",
    body: "This invitation was already used to create your account. Sign in with that account.",
    action: "Sign in",
  },
  revoked: {
    title: "Invitation cancelled",
    body: "This invitation is no longer active. If you think that is a mistake, ask HG for a new link.",
    action: "Go to member login",
  },
  expired: {
    title: "Invitation expired",
    body: "This invitation link has expired. Ask HG to send you a new one.",
    action: "Go to member login",
  },
}

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const { invite: tokenParam } = await searchParams
  const token = typeof tokenParam === "string" ? tokenParam : null
  const found = token ? await findInvite(token) : null
  const invite = found?.invite ?? null
  const problem: InviteProblem | null = !token || !invite ? "invalid" : invite.status === "accepted" ? "accepted" : invite.status === "revoked" ? "revoked" : found?.expired ? "expired" : null

  if (problem || !invite || !token) {
    const copy = PROBLEMS[problem ?? "invalid"]
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Button render={<Link href="/login" />} nativeButton={false}>
          {copy.action}
        </Button>
      </div>
    )
  }

  const first = invite.periods[0]
  const last = invite.periods.at(-1)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Welcome</p>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {invite.fullName.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Create your login for <span className="font-medium text-foreground">{invite.email}</span>.
        </p>
        {first && last && (
          <p className="text-sm text-muted-foreground">
            Membership: <span className="font-medium text-foreground">{invite.periods.map((p) => p.label).join(", ")}</span> ({describePeriodRange(first.start, last.end)})
          </p>
        )}
      </div>
      <WelcomeForm token={token} email={invite.email} />
    </div>
  )
}
