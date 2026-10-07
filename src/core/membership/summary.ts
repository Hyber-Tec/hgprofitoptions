import type { MembershipStatus } from "../domain/types"
import { formatDate } from "../format"
import { quarterLabel, quarterOf } from "./quarters"

export type MembershipTone = "positive" | "warning" | "muted" | "negative"

export interface MembershipSummary {
  /** Short status, e.g. "Active", "Expiring soon", "Upcoming". */
  status: string
  /** The headline, e.g. "Q4 2026" or "Admin". */
  label: string
  /** Supporting text, e.g. "85 days left" or "Starts Jan 1, 2027". */
  detail: string
  tone: MembershipTone
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function membershipSummary(status: MembershipStatus): MembershipSummary {
  switch (status.kind) {
    case "admin":
      return { status: "Admin", label: "Admin", detail: "Full access", tone: "positive" }
    case "active": {
      const left = status.daysLeft === 0 ? "Last day today" : `${plural(status.daysLeft, "day")} left`
      // Back-to-back renewals read as one block: "Q4 2026 to Q1 2027".
      const renewed = status.coverageEnd > status.period.end
      const last = quarterOf(status.coverageEnd)
      const label = renewed
        ? `${status.period.label.split(" to ")[0] ?? status.period.label} to ${quarterLabel(last.year, last.q)}`
        : status.period.label
      return {
        status: status.expiringSoon ? "Expiring soon" : "Active",
        label,
        detail: left,
        tone: status.expiringSoon ? "warning" : "positive",
      }
    }
    case "upcoming":
      return {
        status: "Upcoming",
        label: status.next.label,
        detail: `Starts ${formatDate(status.next.start)}`,
        tone: "muted",
      }
    case "expired":
      return {
        status: "Expired",
        label: status.last.label,
        detail: `Expired ${formatDate(status.last.end)}`,
        tone: "negative",
      }
    case "suspended":
      return { status: "Suspended", label: "Suspended", detail: "Contact HG", tone: "negative" }
    case "none":
      return { status: "No membership", label: "No membership", detail: "Book a call with HG", tone: "muted" }
  }
}
