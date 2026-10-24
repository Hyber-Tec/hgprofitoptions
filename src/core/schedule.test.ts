import { describe, expect, it } from "vitest"
import { DEFAULT_SITE_SETTINGS, siteSettingsSchema } from "@/server/model"
import { asIsoDate } from "./dates"
import {
  classTitle,
  describeWeek,
  isMarketOpen,
  isSessionDay,
  nextOccurrence,
  upcomingSessions,
  weekdayList,
  type ClassSession,
} from "./schedule"

const schedule = DEFAULT_SITE_SETTINGS.classSchedule
const sunday: ClassSession = {
  day: 0,
  start: "19:00",
  end: "20:30",
  title: "Group class",
  audience: "everyone",
  note: "",
}
const thursdayOpen: ClassSession = {
  day: 4,
  start: "09:30",
  end: "10:30",
  title: "Beginner session",
  audience: "beginners",
  note: "",
}

describe("weekly classes", () => {
  it("keeps the wall-clock time on the days the clocks change", () => {
    // Clocks go back at 2 AM on Sunday, Nov 1 2026: 7 PM that evening is EST (UTC-5).
    expect(nextOccurrence(sunday, new Date("2026-10-30T16:00:00Z")).start.toISOString()).toBe(
      "2026-11-02T00:00:00.000Z",
    )
    // Clocks go forward on Sunday, Mar 14 2027: 7 PM is EDT (UTC-4).
    expect(nextOccurrence(sunday, new Date("2027-03-12T16:00:00Z")).start.toISOString()).toBe(
      "2027-03-14T23:00:00.000Z",
    )
  })

  it("counts a class until it ends, then moves to the next week", () => {
    // 7:30 PM EDT on Sunday, Oct 25 2026, during the class.
    expect(nextOccurrence(sunday, new Date("2026-10-25T23:30:00Z")).date).toBe("2026-10-25")
    // 8:45 PM EDT, after it ended.
    expect(nextOccurrence(sunday, new Date("2026-10-26T00:45:00Z")).date).toBe("2026-11-01")
  })

  it("skips market holidays for a session at the open, but not an evening class", () => {
    // Thanksgiving, Thursday Nov 26 2026.
    expect(nextOccurrence(thursdayOpen, new Date("2026-11-25T15:00:00Z")).date).toBe("2026-12-03")
    expect(isSessionDay(thursdayOpen, asIsoDate("2026-11-26"))).toBe(false)
    const thursdayEvening = { ...thursdayOpen, start: "19:00", end: "20:00" }
    expect(nextOccurrence(thursdayEvening, new Date("2026-11-25T15:00:00Z")).date).toBe("2026-11-26")
  })

  it("lists sessions soonest first", () => {
    // Monday, Oct 26 2026: Tuesday's session comes first, then Thursday's, then Sunday's class.
    const next = upcomingSessions(schedule, new Date("2026-10-26T15:00:00Z"))
    expect(next.map((s) => s.next.date)).toEqual(["2026-10-27", "2026-10-29", "2026-11-01"])
  })

  it("describes the week for the site's copy", () => {
    expect(describeWeek(schedule)).toBe(
      "a group class every Sunday evening and beginner sessions on Tuesday and Thursday",
    )
    expect(describeWeek([])).toBeNull()
    expect(weekdayList([4, 2])).toBe("Tuesday and Thursday")
    expect(weekdayList([5, 1, 3])).toBe("Monday, Wednesday and Friday")
  })

  it("names a recap after that day's session", () => {
    expect(classTitle(asIsoDate("2026-10-25"), schedule)).toBe("Group class")
    expect(classTitle(asIsoDate("2026-10-27"), schedule)).toBe("Beginner session")
    expect(classTitle(asIsoDate("2026-10-24"), schedule)).toBe("Saturday class")
  })

  it("reads schedules saved with a free-text audience", () => {
    const parsed = siteSettingsSchema.parse({
      bookingUrl: "https://example.com/book",
      classSchedule: [
        { day: 6, start: "18:00", end: "19:00", title: "Beginner session", audience: "Mandatory for beginners" },
        { day: 6, start: "19:00", end: "20:30", title: "All traders", audience: "Everyone" },
      ],
    })
    expect(parsed.classSchedule).toEqual([
      {
        day: 6,
        start: "18:00",
        end: "19:00",
        title: "Beginner session",
        audience: "beginners",
        note: "Mandatory for beginners",
      },
      { day: 6, start: "19:00", end: "20:30", title: "All traders", audience: "everyone", note: "Everyone" },
    ])
    expect(parsed.classReminderMinutes).toBe(60)
  })

  it("knows the market is closed on holidays", () => {
    // 10 AM ET on Thanksgiving, and on the day before.
    expect(isMarketOpen(new Date("2026-11-26T15:00:00Z"))).toBe(false)
    expect(isMarketOpen(new Date("2026-11-25T15:00:00Z"))).toBe(true)
  })
})
