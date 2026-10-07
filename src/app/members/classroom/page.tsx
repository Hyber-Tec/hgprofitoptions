import type { Metadata } from "next"
import { LuCalendarCheck, LuCalendarPlus, LuClock } from "react-icons/lu"
import { SiWhatsapp, SiZoom } from "react-icons/si"
import { todayInMarketZone, zonedStartOfDay } from "@/core/dates"
import { WEEKDAYS, formatDayIn, formatTimeIn, isMarketOpen, nextOccurrence, zoneAbbreviation } from "@/core/schedule"
import { requireActiveMember } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"
import { getMemberSettings } from "@/lib/data/settings"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Classroom" }

export default async function ClassroomPage() {
  const viewer = await requireActiveMember("/members/classroom")
  const [site, settings] = await Promise.all([getSiteSettings(), getMemberSettings()])
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
        description="Live classes on Zoom every week, a monthly one-on-one with HG and the member WhatsApp group."
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<a href="/members/classroom/calendar.ics" />}
            nativeButton={false}
          >
            <LuCalendarPlus />
            Add classes to my calendar
          </Button>
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
                <p className="flex items-center gap-2 text-sm tabular-nums">
                  <LuClock className="size-4 text-muted-foreground" />
                  {formatTimeIn(s.next.start, "America/New_York")} to {formatTimeIn(s.next.end, "America/New_York")} ET
                  {showLocal && (
                    <span className="text-muted-foreground">
                      · {formatTimeIn(s.next.start, tz)} to {formatTimeIn(s.next.end, tz)}{" "}
                      {zoneAbbreviation(s.next.start, tz)} your time
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{s.audience}</p>
              </CardContent>
              {settings.zoomUrl && (
                <CardFooter className="border-t pt-4">
                  <Button
                    size="sm"
                    render={<a href={settings.zoomUrl} target="_blank" rel="noopener noreferrer" />}
                    nativeButton={false}
                  >
                    <SiZoom />
                    Join on Zoom
                  </Button>
                </CardFooter>
              )}
            </Card>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">The class schedule will be posted here.</p>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Monthly one-on-one</CardTitle>
              <CardDescription>A private session with HG each month to review your trades and plan.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button render={<a href={bookHref} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                <LuCalendarCheck />
                Book my one-on-one
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Member WhatsApp group</CardTitle>
              <CardDescription>Questions, quick updates and class reminders.</CardDescription>
            </CardHeader>
            <CardFooter>
              {settings.whatsappUrl ? (
                <Button
                  variant="outline"
                  render={<a href={settings.whatsappUrl} target="_blank" rel="noopener noreferrer" />}
                  nativeButton={false}
                >
                  <SiWhatsapp />
                  Open WhatsApp group
                </Button>
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
