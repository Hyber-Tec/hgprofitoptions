"use client"

import { useState, useTransition } from "react"
import { LuLink2, LuX } from "react-icons/lu"
import { cancelInvite, resendInvite } from "@/lib/actions/admin/members"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "@/components/portal/display"
import { LinkDialog } from "./invite-link-dialog"

export interface InviteRow {
  email: string
  fullName: string
  role: "admin" | "member"
  period: string | null
  createdAt: string
  expiresAt: string
  expired: boolean
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })

export function PendingInvites({ invites }: { invites: InviteRow[] }) {
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const renew = (email: string) => {
    setBusy(email)
    startTransition(async () => {
      const result = await resendInvite(email)
      setBusy(null)
      if (!result.ok) {
        toast.add({ title: "No new link", description: result.message, type: "error" })
        return
      }
      setLink(result.data.link)
      if (result.data.emailed) toast.add({ title: "Invitation emailed", type: "success" })
    })
  }
  const cancel = (email: string) => {
    setBusy(email)
    startTransition(async () => {
      const result = await cancelInvite(email)
      setBusy(null)
      toast.add(
        result.ok
          ? { title: "Invitation cancelled", type: "success" }
          : { title: "Not cancelled", description: result.message, type: "error" },
      )
    })
  }

  return (
    <>
      <ul className="flex flex-col divide-y rounded-xl border">
        {invites.map((i) => (
          <li key={i.email} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {i.fullName}
                {i.role === "admin" && <ToneBadge tone="neutral">Admin</ToneBadge>}
                {i.expired && <ToneBadge tone="warning">Link expired</ToneBadge>}
              </p>
              <p className="text-sm text-muted-foreground">
                {i.email}
                {i.period && ` · ${i.period}`} · invited {DATE.format(new Date(i.createdAt))}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy === i.email} onClick={() => renew(i.email)}>
                {busy === i.email ? <Spinner /> : <LuLink2 />}
                New link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === i.email}
                onClick={() => cancel(i.email)}
                aria-label={`Cancel the invitation for ${i.email}`}
              >
                <LuX />
                Cancel
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <LinkDialog
        link={link}
        onOpenChange={(open) => !open && setLink(null)}
        title="New invitation link"
        description="The previous link no longer works. Send this one to the member by text, WhatsApp or email. It expires in 14 days."
      />
    </>
  )
}
