import { describe, expect, it } from "vitest"
import { briefParts, dueBriefTime } from "./briefs"

describe("the brief's times", () => {
  const times = ["05:30", "09:40", "10:00", "10:30"]
  // Friday Oct 23, 2026 (EDT, UTC-4).
  const at = (hhmm: string, date = "2026-10-23") => new Date(`${date}T${hhmm}:00-04:00`)

  it("is due for 15 minutes after each time on a market day", () => {
    expect(dueBriefTime(times, at("09:40"))).toEqual({ date: "2026-10-23", time: "09:40" })
    expect(dueBriefTime(times, at("09:54"))).toEqual({ date: "2026-10-23", time: "09:40" })
    expect(dueBriefTime(times, at("09:56"))).toBeNull()
    expect(dueBriefTime(times, at("10:05"))).toEqual({ date: "2026-10-23", time: "10:00" })
    expect(dueBriefTime(times, at("05:29"))).toBeNull()
  })

  it("is not due on weekends or market holidays", () => {
    expect(dueBriefTime(times, at("09:45", "2026-10-24"))).toBeNull()
    // Thanksgiving.
    expect(dueBriefTime(times, new Date("2026-11-26T09:45:00-05:00"))).toBeNull()
  })
})

describe("reading a brief", () => {
  it("splits paragraphs and lists, with a paragraph leading into its list", () => {
    expect(
      briefParts(
        "New strike prices post today.\n\nThe levels were tightened on:\n- TSM and NVDA\n- META\nWatch fuel.\r\n\r\n1. Dow\n2) S&P",
      ),
    ).toEqual([
      { kind: "paragraph", lines: ["New strike prices post today."] },
      { kind: "paragraph", lines: ["The levels were tightened on:"] },
      { kind: "list", lines: ["TSM and NVDA", "META"] },
      { kind: "paragraph", lines: ["Watch fuel."] },
      { kind: "list", lines: ["Dow", "S&P"] },
    ])
  })
})
