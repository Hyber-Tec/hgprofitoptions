import type { Metadata } from "next"
import Link from "next/link"
import { LuCalendarCheck, LuCalendarPlus, LuClock, LuVideo } from "react-icons/lu"
import { SiWhatsapp, SiZoom } from "react-icons/si"
import { todayInMarketZone, zonedStartOfDay } from "@/core/dates"
import { formatDate } from "@/core/format"
import { WEEKDAYS, formatDayIn, formatTimeIn, isMarketOpen, nextOccurrence, zoneAbbreviation } from "@/core/schedule"
import { classMeetingNumber } from "@/core/zoom"
import { requireActiveMember } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"
import { listPublishedRecaps } from "@/lib/data/recaps"
import { getMemberSettings } from "@/lib/data/settings"
import { integrations } from "@/lib/env.server"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Classroom" }

export default async function ClassroomPage() {
  const viewer = await requireActiveMember("/members/classroom")
  const [site, settings, recaps] = await Promise.all([getSiteSettings(), getMemberSettings(), listPublishedRecaps(3)])
  const inSite = integrations.zoomEmbed && classMeetingNumber(settings) !== null
  const tz = viewer.member.timezone
  const showLocal = tz !== "America/New_York"
  const sessions = site.classSchedule.map((s) => ({ ...s, next: nextOccurrence(s) }))
  // Regular market hours today, shown in ET and the member's own time.
  const today = todayInMarketZone()
  const open = new Date(zonedStartOfDay(today).getTime() + (9 * 60 + 30) * 60_000)
  const close = new Date(zonedStartOfDay(today).getTime() + 16 * 60 * 60_000)
  const bookHref = settings.oneOnOneUrl ?? site.bookingUrl

  return (
    <>
      <PageHeader
        title="Classroom"
        description="Live classes every week and their recaps, a monthly one-on-one with HG and the member WhatsApp group."
        actions={
          <ButtonAnchor variant="outline" size="sm" href="/members/classroom/calendar.ics">
            <LuCalendarPlus />
            Add classes to my calendar
          </ButtonAnchor>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {sessions.map((s) => (
            <Card key={`${s.day}-${s.start}`}>
              <CardHeader>
                <CardDescription>
                  Every {WEEKDAYS[s.day]} · next on {formatDayIn(s.next.start, "America/New_York")}
                </CardDescription>
                <CardTitle className="text-lg">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="flex items-start gap-2 text-sm tabular-nums">
                  <LuClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>
                    <span className="whitespace-nowrap">
                      {formatTimeIn(s.next.start, "America/New_York")} to {formatTimeIn(s.next.end, "America/New_York")}{" "}
                      ET
                    </span>
                    {showLocal && (
                      <span className="text-muted-foreground">
                        {" "}
                        ·{" "}
                        <span className="whitespace-nowrap">
                          {formatTimeIn(s.next.start, tz)} to {formatTimeIn(s.next.end, tz)}{" "}
                          {zoneAbbreviation(s.next.start, tz)}
                        </span>{" "}
                        your time
                      </span>
                    )}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">{s.audience}</p>
              </CardContent>
              {(inSite || settings.zoomUrl) && (
                <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
                  {inSite && (
                    <ButtonLink size="sm" href="/members/classroom/live">
                      <LuVideo />
                      Join class
                    </ButtonLink>
                  )}
                  {settings.zoomUrl && (
                    <ButtonAnchor
                      size="sm"
                      variant={inSite ? "outline" : "default"}
                      href={settings.zoomUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <SiZoom />
                      {inSite ? "Zoom app" : "Join on Zoom"}
                    </ButtonAnchor>
                  )}
                </CardFooter>
              )}
            </Card>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">The class schedule will be posted here.</p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Class recaps</CardTitle>
              <CardDescription>The key points, tickers and questions of each class.</CardDescription>
              {recaps.length > 0 && (
                <CardAction>
                  <ButtonLink variant="outline" size="sm" href="/members/classroom/recaps">
                    All recaps
                  </ButtonLink>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {recaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The recap of each class shows up here a little while after it ends.
                </p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {recaps.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/members/classroom/recaps/${r.id}`}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium">{r.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatDate(r.date)}
                          </span>
                        </span>
                        <span className="line-clamp-1 text-sm text-muted-foreground">{r.summary?.overview}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Monthly one-on-one</CardTitle>
              <CardDescription>A private session with HG each month to review your trades and plan.</CardDescription>
            </CardHeader>
            <CardFooter>
              <ButtonAnchor href={bookHref} target="_blank" rel="noopener noreferrer">
                <LuCalendarCheck />
                Book my one-on-one
              </ButtonAnchor>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Member WhatsApp group</CardTitle>
              <CardDescription>Questions, quick updates and class reminders.</CardDescription>
            </CardHeader>
            <CardFooter>
              {settings.whatsappUrl ? (
                <ButtonAnchor variant="outline" href={settings.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <SiWhatsapp />
                  Open WhatsApp group
                </ButtonAnchor>
              ) : (
                <p className="text-sm text-muted-foreground">HG will share the group link.</p>
              )}
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Market hours
                <ToneBadge tone={isMarketOpen() ? "positive" : "muted"}>
                  {isMarketOpen() ? "Open now" : "Closed now"}
                </ToneBadge>
              </CardTitle>
              <CardDescription>US stock and options regular session, Monday to Friday.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm tabular-nums">
              <p>9:30 AM to 4:00 PM ET</p>
              {showLocal && (
                <p className="text-muted-foreground">
                  {formatTimeIn(open, tz)} to {formatTimeIn(close, tz)} {zoneAbbreviation(open, tz)} your time
                </p>
              )}
              <p className="text-xs text-muted-foreground">Closed on US market holidays.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
