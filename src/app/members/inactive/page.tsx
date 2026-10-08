import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LuCalendarCheck, LuDownload, LuNotebookPen, LuWallet } from "react-icons/lu"
import { describePeriodRange } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import { requireViewer } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Membership" }

export default async function InactivePage() {
  const viewer = await requireViewer("/members/inactive")
  if (viewer.hasAccess) redirect("/members")
  const site = await getSiteSettings()
  const summary = membershipSummary(viewer.status)
  const status = viewer.status
  const headline =
    status.kind === "upcoming"
      ? `Your membership starts ${summary.detail.replace("Starts ", "")}`
      : status.kind === "expired"
        ? "Your membership has ended"
        : "You do not have an active membership"
  const range =
    status.kind === "upcoming"
      ? describePeriodRange(status.next.start, status.next.end)
      : status.kind === "expired"
        ? describePeriodRange(status.last.start, status.last.end)
        : null

  return (
    <>
      <PageHeader
        title="Membership"
        description="Tools, alerts and classes open again as soon as a membership period is active."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardDescription>{summary.status}</CardDescription>
            <CardTitle className="text-xl">{headline}</CardTitle>
            {range && (
              <CardDescription>
                {summary.label} · {range}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {status.kind === "upcoming"
                ? "Your access opens automatically on the first day of your quarter, at midnight New York time."
                : "Book a short call with HG to renew for the next quarter. Your journal and portfolio are kept, and you can export them at any time."}
            </p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
            <ButtonAnchor href={site.bookingUrl} target="_blank" rel="noopener noreferrer">
              <LuCalendarCheck />
              Book a call with HG
            </ButtonAnchor>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>Read-only while your membership is inactive.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <ButtonLink variant="outline" className="justify-start" href="/members/journal">
              <LuNotebookPen />
              Open my journal
            </ButtonLink>
            <ButtonLink variant="outline" className="justify-start" href="/members/portfolio">
              <LuWallet />
              Open my portfolio
            </ButtonLink>
            <ButtonAnchor variant="outline" className="justify-start" href="/members/journal/export.csv">
              <LuDownload />
              Export my journal
            </ButtonAnchor>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
