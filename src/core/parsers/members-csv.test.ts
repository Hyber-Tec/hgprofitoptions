import { describe, expect, it } from "vitest"
import type { IsoDate } from "../domain/types"
import { MEMBER_CSV_TEMPLATE, parseMembersCsv } from "./members-csv"

const today = "2026-10-07" as IsoDate
const header = "name,email,phone,whatsapp,location,timezone,start_quarter,start_year,quarters,custom_start,notes"

function rows(csv: string) {
  const result = parseMembersCsv(csv, today)
  if ("error" in result) throw new Error(result.error)
  return result.rows
}

describe("member import CSV", () => {
  it("reads the template row into a quarterly period", () => {
    const [row] = rows(MEMBER_CSV_TEMPLATE)
    expect(row).toMatchObject({
      line: 2,
      email: "jane@example.com",
      fullName: "Jane Doe",
      timezone: "America/Chicago",
      notes: "Referred by Ava",
      error: null,
    })
    expect(row?.period).toMatchObject({ start: "2026-10-01", end: "2026-12-31", label: "Q4 2026", kind: "quarterly" })
  })

  it("accepts loose headers, Q-prefixed quarters, multi-quarter and custom starts", () => {
    const [ok] = rows(
      "Full Name,E-mail,Start Quarter,Start Year,Quarters,Custom Start\nSam  Lee,SAM@Example.com,Q4,2026,2,2026-10-15",
    )
    expect(ok).toMatchObject({
      fullName: "Sam Lee",
      email: "sam@example.com",
      timezone: "America/New_York",
      error: null,
    })
    expect(ok?.period).toMatchObject({ start: "2026-10-15", end: "2027-03-31", kind: "custom" })
  })

  it("explains each problem on its own line", () => {
    const csv = [
      header,
      ",nobody@example.com,,,,,4,2026,1,,",
      "No Email,not-an-email,,,,,4,2026,1,,",
      "Bad Quarter,bq@example.com,,,,,5,2026,1,,",
      "Bad Year,by@example.com,,,,,4,26,1,,",
      "Too Long,tl@example.com,,,,,4,2026,12,,",
      "Bad Start,bs@example.com,,,,,4,2026,1,2026-07-01,",
      "Old Member,old@example.com,,,,,1,2024,1,,",
      "Bad Zone,bz@example.com,,,,Mars/Base,4,2026,1,,",
      "Jane Again,JANE@example.com,,,,,4,2026,1,,",
      "Jane Twice,jane@example.com,,,,,4,2026,1,,",
      ",,,,,,,,,,",
    ].join("\n")
    expect(rows(csv).map((r) => [r.line, r.error])).toEqual([
      [2, "Missing the member's name."],
      [3, '"not-an-email" is not a valid email.'],
      [4, "start_quarter must be 1 to 4."],
      [5, "start_year must be a year like 2026."],
      [6, "quarters must be 1 to 8."],
      [7, "custom_start must fall inside Q4 2026."],
      [8, "This membership ended more than a year ago."],
      [9, 'Unknown time zone "Mars/Base". Use a name like America/Chicago.'],
      [10, null],
      [11, "Listed twice in this file (line 10)."],
    ])
  })

  it("needs a header row with name and email", () => {
    expect(parseMembersCsv("jane@example.com,Jane", today)).toEqual({
      error: "The first row must name the columns, including name and email.",
    })
  })
})
