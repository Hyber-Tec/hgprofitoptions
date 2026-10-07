import type { Metadata } from "next"
import { requireViewer } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { PageHeader } from "@/components/portal/page-header"
import { PushSettings } from "@/components/portal/push-controls"
import { NotificationPrefs } from "@/components/portal/settings/notification-prefs"
import { SettingsNav } from "@/components/portal/settings/settings-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Notifications" }

export default async function NotificationSettingsPage() {
  const viewer = await requireViewer("/members/settings/notifications")
  return (
    <>
      <PageHeader title="Settings" description="Choose how HG's alerts reach you." />
      <SettingsNav />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>What notifies you</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPrefs initial={viewer.member.prefs} emailAvailable={integrations.email} />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>This device</CardTitle>
            <CardDescription>Browser notifications are set up per browser and device.</CardDescription>
          </CardHeader>
          <CardContent>
            <PushSettings />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
