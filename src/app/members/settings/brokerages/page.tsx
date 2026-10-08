import type { Metadata } from "next"
import { requireViewer } from "@/lib/auth/guards"
import { brokerageConfig } from "@/lib/env.server"
import { adminDb } from "@/lib/firebase/admin"
import { readAccounts, readConnections } from "@/server/portfolio"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { ConnectBrokerage } from "@/components/portal/portfolio/brokerage-controls"
import { DisconnectButton } from "@/components/portal/settings/brokerage-list"
import { SettingsNav } from "@/components/portal/settings/settings-nav"
import { RelativeTime } from "@/components/shared/relative-time"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Brokerages" }

export default async function BrokerageSettingsPage() {
  const viewer = await requireViewer("/members/settings/brokerages")
  const available = brokerageConfig() !== null && viewer.hasAccess
  const [connections, accounts] = await Promise.all([
    readConnections(adminDb(), viewer.uid),
    readAccounts(adminDb(), viewer.uid),
  ])
  return (
    <>
      <PageHeader
        title="Settings"
        description="Connected brokerages are read-only. HG Profit Options never places trades."
      />
      <SettingsNav />
      <Card>
        <CardHeader>
          <CardTitle>Connected brokerages</CardTitle>
          <CardDescription>
            {connections.length === 0 ? "Nothing connected yet." : `${connections.length} connected`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {connections.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {connections.map((c) => {
                const linked = accounts.filter((a) => a.connectionId === c.id)
                return (
                  <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {c.brokerageName}
                        <ToneBadge
                          tone={c.status === "active" ? "positive" : c.status === "needs_reauth" ? "warning" : "muted"}
                        >
                          {c.status === "active"
                            ? "Connected"
                            : c.status === "needs_reauth"
                              ? "Needs reconnecting"
                              : "Disabled"}
                        </ToneBadge>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {linked.length} {linked.length === 1 ? "account" : "accounts"}
                        {c.lastSyncedAt && (
                          <>
                            {" · last synced "}
                            <RelativeTime iso={c.lastSyncedAt.toISOString()} />
                          </>
                        )}
                        {" · consent given "}
                        {c.consentedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.status === "needs_reauth" && (
                        <ConnectBrokerage available={available} reconnectId={c.id} label="Reconnect" />
                      )}
                      <DisconnectButton connectionId={c.id} name={c.brokerageName} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {connections.length === 0 ? "Connect a brokerage" : "Connect another brokerage"}
            </p>
            <ConnectBrokerage available={available} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
