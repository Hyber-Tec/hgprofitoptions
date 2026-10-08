import "server-only"
import { quarterLabel, quarterOf } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import type { Invite } from "@/server/model"
import type { MemberRow } from "@/lib/data/admin"
import type { MemberListRow } from "@/components/admin/members-table"
import type { InviteRow } from "@/components/admin/pending-invites"

const TONES = { positive: "positive", warning: "warning", muted: "muted", negative: "negative" } as const

/** The serializable row the admin members table shows. */
export function toMemberListRow({ member, periods, status }: MemberRow): MemberListRow {
  const summary = membershipSummary(status)
  const latest = periods.at(-1) ?? null
  const endDate =
    status.kind === "active"
      ? status.coverageEnd
      : status.kind === "upcoming"
        ? status.next.end
        : status.kind === "expired"
          ? status.last.end
          : (latest?.end ?? null)
  const ends = endDate ? quarterOf(endDate) : null
  return {
    uid: member.uid,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone,
    role: member.role,
    statusKind: status.kind,
    statusLabel: summary.status,
    tone: TONES[summary.tone],
    periodLabel:
      status.kind === "admin"
        ? "Admin"
        : status.kind === "suspended"
          ? (latest?.label ?? null)
          : status.kind === "none"
            ? null
            : summary.label,
    endDate,
    daysLeft: status.kind === "active" ? status.daysLeft : null,
    endsQuarter: ends ? quarterLabel(ends.year, ends.q) : null,
    memberSince: member.memberSince,
    linked: member.brokerage.status === "needs_reauth" ? "error" : member.brokerage.linked ? "yes" : "no",
    qtdReturn: member.stats?.qtdReturn ?? null,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    deletionRequested: member.deletionRequestedAt !== null,
  }
}

export function toInviteRow(i: Invite): InviteRow {
  return {
    email: i.email,
    fullName: i.fullName,
    role: i.role,
    period: i.periods.map((p) => p.label).join(", ") || null,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
    expired: i.expiresAt.getTime() < Date.now(),
  }
}
