/** Audit log vocabulary shared by the writers (server) and the admin views. */

/** The category is the action's prefix ("member.updated" -> "member"); it is stored so views can filter in the query. */
export const auditCategory = (action: string): string => action.split(".")[0] ?? action

export const AUDIT_FILTERS = [
  { value: "members", label: "Members", categories: ["member", "period", "invite"] },
  { value: "alerts", label: "Alerts", categories: ["alert"] },
  { value: "targets", label: "Strike targets", categories: ["targets"] },
  { value: "market", label: "Market data", categories: ["ticker", "etfs", "market"] },
  { value: "content", label: "Content", categories: ["presentation", "file", "testimonial", "faq"] },
  { value: "settings", label: "Settings", categories: ["settings", "hg"] },
] as const

export type AuditFilter = (typeof AUDIT_FILTERS)[number]["value"]

const ACTION_LABELS: Record<string, string> = {
  "member.joined": "Joined",
  "member.updated": "Profile updated",
  "member.suspended": "Suspended",
  "member.reinstated": "Reinstated",
  "member.promoted": "Made an admin",
  "member.demoted": "Admin access removed",
  "member.deleted": "Member deleted",
  "member.password_reset": "Password reset link created",
  "member.signed_out": "Signed out everywhere",
  "member.deletion_requested": "Asked for account deletion",
  "member.viewed_portfolio": "Viewed portfolio",
  "member.viewed_journal": "Viewed journal",
  "invite.created": "Invitation created",
  "invite.renewed": "Invitation link renewed",
  "invite.revoked": "Invitation cancelled",
  "period.added": "Membership added",
  "period.renewed": "Renewed for the next quarter",
  "period.removed": "Membership removed",
  "alert.published": "Alert published",
  "alert.scheduled": "Alert scheduled",
  "alert.revised": "Alert revised",
  "alert.closed": "Alert closed",
  "alert.follow_up": "Follow-up posted",
  "alert.cancelled": "Alert cancelled",
  "targets.published": "Strike targets published",
  "targets.revised": "Strike targets revised",
  "ticker.created": "Ticker added",
  "ticker.updated": "Ticker updated",
  "etfs.updated": "Leveraged ETF guide updated",
  "market.index_values": "Index values entered",
  "settings.site_updated": "Site settings updated",
  "settings.members_updated": "Member settings updated",
  "settings.hg_visibility_updated": "HG portfolio visibility changed",
  "hg.house_added": "House account added",
  "hg.house_removed": "House account removed",
  "presentation.created": "Presentation added",
  "presentation.updated": "Presentation updated",
  "presentation.deleted": "Presentation deleted",
  "file.created": "File added",
  "file.updated": "File updated",
  "file.deleted": "File deleted",
  "testimonial.created": "Testimonial added",
  "testimonial.updated": "Testimonial updated",
  "testimonial.deleted": "Testimonial deleted",
  "faq.created": "Question added",
  "faq.updated": "Question updated",
  "faq.deleted": "Question deleted",
}

export function describeAuditAction(action: string): string {
  const known = ACTION_LABELS[action]
  if (known) return known
  const words = action.replace(/[._]/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const humanizeKey = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()

/** "entries 94 · revision 1". Ids are left out; lists show their length. */
export function formatAuditDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return ""
  const parts: string[] = []
  for (const [key, value] of Object.entries(detail)) {
    if (/id$/i.test(key) || value === null || value === undefined) continue
    if (Array.isArray(value)) parts.push(`${humanizeKey(key)} ${value.length}`)
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      parts.push(`${humanizeKey(key)} ${String(value)}`)
  }
  return parts.join(" · ")
}
