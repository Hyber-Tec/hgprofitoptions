import { describe, expect, it } from "vitest"
import { classMeetingNumber, formatMeetingId, normalizeMeetingId, zoomMeetingNumber } from "./zoom"

describe("Zoom meetings", () => {
  it("finds the meeting number in a Zoom link", () => {
    expect(zoomMeetingNumber("https://us02web.zoom.us/j/81234567890?pwd=abc")).toBe("81234567890")
    expect(zoomMeetingNumber("https://zoom.us/wc/join/123456789")).toBe("123456789")
    expect(zoomMeetingNumber("https://zoom.us/wc/81234567890/join")).toBe("81234567890")
    expect(zoomMeetingNumber("https://example.com/meeting")).toBeNull()
  })

  it("reads a meeting ID as people type it", () => {
    expect(normalizeMeetingId("812 3456 7890")).toBe("81234567890")
    expect(normalizeMeetingId("812-3456-7890")).toBe("81234567890")
    expect(normalizeMeetingId("12345")).toBeNull()
    expect(normalizeMeetingId("zoom")).toBeNull()
  })

  it("uses the entered ID first, then the class link", () => {
    expect(classMeetingNumber({ zoomMeetingId: "81234567890", zoomUrl: "https://zoom.us/j/99999999999" })).toBe(
      "81234567890",
    )
    expect(classMeetingNumber({ zoomMeetingId: null, zoomUrl: "https://zoom.us/j/99999999999" })).toBe("99999999999")
    expect(classMeetingNumber({ zoomMeetingId: null, zoomUrl: null })).toBeNull()
  })

  it("groups the digits the way Zoom shows them", () => {
    expect(formatMeetingId("81234567890")).toBe("812 3456 7890")
    expect(formatMeetingId("8123456789")).toBe("812 345 6789")
    expect(formatMeetingId("812345678")).toBe("812345678")
  })
})
