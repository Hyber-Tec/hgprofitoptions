import { getViewer } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"
import { getMemberSettings } from "@/lib/data/settings"
import { dayOfWeek } from "@/core/dates"
import { marketHolidays } from "@/core/holidays"
import { AUDIENCE_LABELS, nextOccurrence, type ClassSession } from "@/core/schedule"
import type { IsoDate } from "@/core/domain/types"

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const
const escape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
const local = (date: string, hhmm: string) => `${date.replaceAll("-", "")}T${hhmm.replace(":", "")}00`

/** Market holidays over the next year on which a session in market hours is not held. */
function skippedDays(session: ClassSession, from: IsoDate): IsoDate[] {
  if (session.start >= "16:00") return []
  const year = Number(from.slice(0, 4))
  return [...marketHolidays(year), ...marketHolidays(year + 1)]
    .filter((d) => d > from && dayOfWeek(d) === session.day)
    .sort()
}

/** The weekly classes as a calendar subscription file (New York time, repeating weekly). */
export async function GET() {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const [site, settings] = await Promise.all([getSiteSettings(), getMemberSettings()])
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
  const events = site.classSchedule.map((s, i) => {
    const next = nextOccurrence(s)
    return [
      "BEGIN:VEVENT",
      `UID:hg-class-${i}-${s.day}-${s.start.replace(":", "")}@hgprofitoptions`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/New_York:${local(next.date, s.start)}`,
      `DTEND;TZID=America/New_York:${local(next.date, s.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DAYS[s.day] ?? "SU"}`,
      ...skippedDays(s, next.date).map((d) => `EXDATE;TZID=America/New_York:${local(d, s.start)}`),
      `SUMMARY:${escape(`HG Profit Options: ${s.title}`)}`,
      `DESCRIPTION:${escape(
        [s.note, `For: ${AUDIENCE_LABELS[s.audience]}`, settings.zoomUrl ? `Zoom: ${settings.zoomUrl}` : ""]
          .filter(Boolean)
          .join("\n"),
      )}`,
      ...(settings.zoomUrl ? [`LOCATION:${escape(settings.zoomUrl)}`] : []),
      "END:VEVENT",
    ].join("\r\n")
  })
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HG Profit Options//Classroom//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:HG Profit Options classes",
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n")
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="hg-profit-options-classes.ics"',
      "Cache-Control": "private, no-store",
    },
  })
}
