import type { Metadata } from "next"
import { LuArrowUpRight, LuLink2 } from "react-icons/lu"
import { formatDateTimeET, formatPrice } from "@/core/format"
import { readAccounts, readConnections } from "@/server/portfolio"
import { requireAdmin } from "@/lib/auth/guards"
import { listMembers } from "@/lib/data/admin"
import { getMemberSettings } from "@/lib/data/settings"
import { getStanding } from "@/lib/data/tools"
import { adminDb } from "@/lib/firebase/admin"
import { HgVisibilityForm, HouseSwitch } from "@/components/admin/settings-forms"
import { Signed, Stat } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "HG portfolio" }

export default async function HgPortfolioPage() {
  await requireAdmin({ next: "/admin/hg-portfolio" })
  const admins = (await listMembers()).filter((m) => m.role === "admin")
  const [settings, standing] = await Promise.all([getMemberSettings(), getStanding()])
  const connections = await Promise.all(
    admins.map(async (a) => ({
      admin: a,
      connections: await readConnections(adminDb(), a.uid),
      accounts: await readAccounts(adminDb(), a.uid),
    })),
  )
  const hg = standing?.hgPortfolio
  return (
    <>
      <PageHeader
        title="HG portfolio"
        description="Choose which of HG's own brokerage connections count as the house portfolio, and what members see on HG standing."
        actions={
          <ButtonLink size="sm" variant="outline" href="/members/standing">
            Member view
            <LuArrowUpRight />
          </ButtonLink>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>House accounts</CardTitle>
            <CardDescription>Connect a brokerage from your own portfolio page, then mark it here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {connections.every((c) => c.connections.length === 0) ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">No admin has linked a brokerage yet.</p>
                <ButtonLink size="sm" href="/members/portfolio">
                  <LuLink2 />
                  Link a brokerage
                </ButtonLink>
              </div>
            ) : (
              connections.flatMap(({ admin, connections: list, accounts }) =>
                list.map((c) => {
                  const linked = accounts.filter((a) => a.connectionId === c.id)
                  return (
                    <div key={c.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {c.brokerageName}{" "}
                          <span className="text-sm font-normal text-muted-foreground">· {admin.fullName}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {linked.length} {linked.length === 1 ? "account" : "accounts"} ·{" "}
                          {formatPrice(linked.reduce((s, a) => s + (a.balance?.total ?? 0), 0))}
                          {c.lastSyncedAt && ` · synced ${formatDateTimeET(c.lastSyncedAt)}`}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                        House
                        <HouseSwitch uid={admin.uid} connectionId={c.id} isHouse={c.isHouse} />
                      </label>
                    </div>
                  )
                }),
              )
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What members see</CardTitle>
          </CardHeader>
          <CardContent>
            <HgVisibilityForm initial={settings.hgPortfolio} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Current standing</CardTitle>
          <CardDescription>
            {standing ? `Computed ${formatDateTimeET(standing.computedAt)}` : "Not computed yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {hg ? (
            (
              [
                ["week", "1W"],
                ["month", "1M"],
                ["qtd", "Quarter"],
                ["ytd", "Year"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => <Stat key={key} label={label} value={<Signed value={hg.returns[key]} />} />)
          ) : (
            <p className="col-span-full text-sm text-muted-foreground">
              Mark a house account to start HG&apos;s track record.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
