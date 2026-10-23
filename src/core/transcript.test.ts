import { describe, expect, it } from "vitest"
import { transcriptText } from "./transcript"

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.200
Hubert Gaffney: Good evening everyone, let's start with TSM.

2
00:00:04.300 --> 00:00:07.900
Hubert Gaffney: It closed above 465, so the target stays.

3
00:00:08.000 --> 00:00:10.000
Ava Martin: Do we wait for the close below the break?

4
00:00:10.100 --> 00:00:12.000
Hubert Gaffney: Yes, wait for the close.
`

describe("transcripts", () => {
  it("joins a speaker's cues and drops numbers and timestamps", () => {
    expect(transcriptText(VTT)).toBe(
      [
        "Hubert Gaffney: Good evening everyone, let's start with TSM. It closed above 465, so the target stays.",
        "Ava Martin: Do we wait for the close below the break?",
        "Hubert Gaffney: Yes, wait for the close.",
      ].join("\n"),
    )
  })

  it("reads SRT files and voice tags", () => {
    const srt =
      "1\r\n00:00:01,000 --> 00:00:02,000\r\n<v HG>Hello class.</v>\r\n\r\n2\r\n00:00:02,500 --> 00:00:03,000\r\nNo speaker here."
    expect(transcriptText(srt)).toBe("HG: Hello class.\nNo speaker here.")
  })

  it("keeps plain text as it is", () => {
    expect(transcriptText("  HG: Welcome.\nAva: Thanks!  ")).toBe("HG: Welcome.\nAva: Thanks!")
  })
})
