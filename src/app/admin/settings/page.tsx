import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { getSiteSettings } from "@/lib/data/public"
import { getMemberSettings } from "@/lib/data/settings"
import { MemberSettingsForm, SiteSettingsForm } from "@/components/admin/settings-forms"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Settings" }

export default async function AdminSettingsPage() {
  await requireAdmin({ next: "/admin/settings" })
  const [site, members] = await Promise.all([getSiteSettings(), getMemberSettings()])
  const services: [string, boolean, string][] = [
    [
      "Email (Resend)",
      integrations.email,
      "Invitations, email alerts and reminders. Without it, you copy invite links yourself.",
    ],
    [
      "Brokerage linking (SnapTrade)",
      integrations.brokerage,
      "Members link brokerages read-only. Without it, members add trades by hand or by CSV.",
    ],
    [
      "Market data",
      integrations.marketData,
      "Daily prices, Key Market Data and medians. Without it, values come from imports and manual entry.",
    ],
  ]
  return (
    <>
      <PageHeader title="Settings" description="Links, the class schedule and how the member area behaves." />
      <Card>
        <CardHeader>
          <CardTitle>Public site</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteSettingsForm initial={site} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Member area</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberSettingsForm initial={members} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connected services</CardTitle>
          <CardDescription>
            Turned on with server keys by the developer. Everything else works without them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {services.map(([name, on, description]) => (
            <div key={name} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span>
                <span className="block text-sm font-medium">{name}</span>
                <span className="block text-sm text-muted-foreground">{description}</span>
              </span>
              <ToneBadge tone={on ? "positive" : "muted"}>{on ? "On" : "Off"}</ToneBadge>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
