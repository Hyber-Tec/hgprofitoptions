import type { Metadata } from "next"
import { LuDownload } from "react-icons/lu"
import { todayInMarketZone } from "@/core/dates"
import { formatDate } from "@/core/format"
import { describePeriodRange } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import { requireViewer } from "@/lib/auth/guards"
import { adminAuth } from "@/lib/firebase/admin"
import { ToneBadge, type Tone } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { DeletionRequest } from "@/components/portal/settings/account-actions"
import { ProfileForm } from "@/components/portal/settings/profile-form"
import { PasswordReset, TwoStepSetup } from "@/components/portal/settings/security-panel"
import { SettingsNav } from "@/components/portal/settings/settings-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export const metadata: Metadata = { title: "Settings" }

const TONE: Record<string, Tone> = { positive: "positive", warning: "warning", muted: "muted", negative: "negative" }

export default async function SettingsPage() {
  const viewer = await requireViewer("/members/settings")
  const user = await adminAuth().getUser(viewer.uid)
  const hasPassword = user.providerData.some((p) => p.providerId === "password")
  const summary = membershipSummary(viewer.status)
  const today = todayInMarketZone()
  const periods = [...viewer.periods].sort((a, b) => b.start.localeCompare(a.start))

  return (
    <>
      <PageHeader title="Settings" description="Your profile, sign-in security, membership and data." />
      <SettingsNav />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your time zone is used to show class times in your local time.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm
                initial={{
                  fullName: viewer.member.fullName,
                  email: viewer.email,
                  phone: viewer.member.phone,
                  whatsapp: viewer.member.whatsapp,
                  location: viewer.member.location,
                  timezone: viewer.member.timezone,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sign-in and security</CardTitle>
              <CardDescription>
                Signed in as {viewer.email}
                {user.providerData.some((p) => p.providerId === "google.com") && " with Google"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <PasswordReset email={viewer.email} hasPassword={hasPassword} />
              <Separator />
              <TwoStepSetup uid={viewer.uid} email={viewer.email} required={viewer.role === "admin"} />
            </CardContent>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Membership
                <ToneBadge tone={TONE[summary.tone] ?? "muted"}>{summary.status}</ToneBadge>
              </CardTitle>
              <CardDescription>
                {summary.label} · {summary.detail}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {viewer.member.memberSince && (
                <p className="text-sm text-muted-foreground">Member since {formatDate(viewer.member.memberSince)}</p>
              )}
              {periods.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border text-sm">
                  {periods.map((p) => {
                    const state = p.end < today ? "Ended" : p.start > today ? "Upcoming" : "Current"
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span>
                          <span className="font-medium">{p.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {describePeriodRange(p.start, p.end)}
                          </span>
                        </span>
                        <ToneBadge tone={state === "Current" ? "positive" : "muted"}>{state}</ToneBadge>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {viewer.role === "admin"
                    ? "Admins have full access without a membership period."
                    : "No membership periods yet."}
                </p>
              )}
              <p className="text-xs text-muted-foreground">To renew or change your membership, book a call with HG.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Your data</CardTitle>
              <CardDescription>Your journal and portfolio belong to you. Download them at any time.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <Button
                variant="outline"
                size="sm"
                render={<a href="/members/journal/export.csv" />}
                nativeButton={false}
              >
                <LuDownload />
                Journal (CSV)
              </Button>
              <Button
                variant="outline"
                size="sm"
                render={<a href="/members/portfolio/export.csv" />}
                nativeButton={false}
              >
                <LuDownload />
                Portfolio history (CSV)
              </Button>
              <Separator className="my-1" />
              <DeletionRequest requestedAt={viewer.member.deletionRequestedAt?.toISOString() ?? null} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
