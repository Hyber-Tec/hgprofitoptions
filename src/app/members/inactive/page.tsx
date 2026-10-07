import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { LuCalendarCheck, LuDownload, LuNotebookPen, LuWallet } from "react-icons/lu"
import { describePeriodRange } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import { requireViewer } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

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
            <Button
              render={<a href={site.bookingUrl} target="_blank" rel="noopener noreferrer" />}
              nativeButton={false}
            >
              <LuCalendarCheck />
              Book a call with HG
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>Read-only while your membership is inactive.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start"
              render={<Link href="/members/journal" />}
              nativeButton={false}
            >
              <LuNotebookPen />
              Open my journal
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              render={<Link href="/members/portfolio" />}
              nativeButton={false}
            >
              <LuWallet />
              Open my portfolio
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              render={<a href="/members/journal/export.csv" />}
              nativeButton={false}
            >
              <LuDownload />
              Export my journal
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
