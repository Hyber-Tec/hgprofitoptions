import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  downloadRecordingText,
  isZoomUrl,
  meetingSdkSignature,
  transcriptFromEvent,
  urlValidationResponse,
  verifyZoomWebhook,
} from "./zoom"

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>

describe("Meeting SDK signature", () => {
  it("is an HS256 JWT for the meeting, valid for two hours", () => {
    const now = Date.UTC(2026, 9, 24, 22, 0, 0)
    const token = meetingSdkSignature({ sdkKey: "key", sdkSecret: "secret" }, "81234567890", 0, now)
    const [header = "", payload = "", signature = ""] = token.split(".")
    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" })
    const claims = decode(payload)
    expect(claims).toMatchObject({ appKey: "key", mn: "81234567890", role: 0 })
    expect(claims.exp).toBe(Number(claims.iat) + 7200)
    expect(claims.tokenExp).toBe(claims.exp)
    expect(Number(claims.iat)).toBe(now / 1000 - 30)
    expect(signature).toBe(createHmac("sha256", "secret").update(`${header}.${payload}`).digest("base64url"))
  })
})

describe("webhooks", () => {
  const secret = "whsec"
  const body = JSON.stringify({ event: "recording.transcript_completed" })
  const now = 1_792_900_000_000
  const timestamp = String(now / 1000)
  const sign = (b: string, t = timestamp) => `v0=${createHmac("sha256", secret).update(`v0:${t}:${b}`).digest("hex")}`

  it("accepts a request signed with the secret", () => {
    expect(verifyZoomWebhook(secret, { signature: sign(body), timestamp }, body, now)).toBe(true)
  })

  it("rejects a changed body, a wrong secret, a missing header or an old timestamp", () => {
    expect(verifyZoomWebhook(secret, { signature: sign(body), timestamp }, `${body} `, now)).toBe(false)
    expect(verifyZoomWebhook("other", { signature: sign(body), timestamp }, body, now)).toBe(false)
    expect(verifyZoomWebhook(secret, { signature: null, timestamp }, body, now)).toBe(false)
    expect(verifyZoomWebhook(secret, { signature: sign(body), timestamp }, body, now + 10 * 60 * 1000)).toBe(false)
  })

  it("answers the endpoint check with the token's HMAC", () => {
    expect(urlValidationResponse(secret, "abc")).toEqual({
      plainToken: "abc",
      encryptedToken: createHmac("sha256", secret).update("abc").digest("hex"),
    })
  })

  it("finds the transcript files in a recording event, in order", () => {
    const event = {
      event: "recording.transcript_completed",
      download_token: "dl-token",
      payload: {
        account_id: "acct",
        object: {
          id: 81234567890,
          uuid: "abc/def==",
          topic: "Saturday class",
          start_time: "2026-10-24T22:00:00Z",
          recording_files: [
            { file_type: "MP4", download_url: "https://zoom.us/rec/download/video" },
            {
              file_type: "TRANSCRIPT",
              file_extension: "VTT",
              recording_start: "2026-10-24T23:10:00Z",
              download_url: "https://zoom.us/rec/download/vtt-2",
            },
            {
              file_type: "TRANSCRIPT",
              file_extension: "VTT",
              recording_start: "2026-10-24T22:00:05Z",
              download_url: "https://zoom.us/rec/download/vtt-1",
            },
          ],
        },
      },
    }
    expect(transcriptFromEvent(event)).toEqual({
      meetingId: "81234567890",
      meetingUuid: "abc/def==",
      topic: "Saturday class",
      startTime: new Date("2026-10-24T22:00:00Z"),
      downloadUrls: ["https://zoom.us/rec/download/vtt-1", "https://zoom.us/rec/download/vtt-2"],
      downloadToken: "dl-token",
    })
    expect(
      transcriptFromEvent({ ...event, payload: { object: { ...event.payload.object, recording_files: [] } } }),
    ).toBeNull()
    expect(transcriptFromEvent({ event: "meeting.started" })).toBeNull()
  })
})

describe("transcript download", () => {
  const vtt = () =>
    new Response("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHG: Hello.", {
      headers: { "Content-Type": "text/vtt" },
    })
  const urlOf = (input: URL | RequestInfo) => (input instanceof Request ? input.url : input.toString())

  it("gets an app token, then downloads with it", async () => {
    const calls: { url: string; auth: string | null }[] = []
    const fetchImpl = ((input: URL | RequestInfo, init?: RequestInit) => {
      const url = urlOf(input)
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") })
      if (url.startsWith("https://zoom.us/oauth/token"))
        return Promise.resolve(Response.json({ access_token: "app-token", expires_in: 3600 }))
      return Promise.resolve(vtt())
    }) as typeof fetch
    const config = { accountId: "acct", clientId: "id", clientSecret: "secret" }
    const text = await downloadRecordingText(
      config,
      { downloadUrl: "https://zoom.us/rec/vtt", downloadToken: null },
      fetchImpl,
    )
    expect(text).toContain("HG: Hello.")
    expect(calls[0]?.url).toBe("https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acct")
    expect(calls[0]?.auth).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`)
    expect(calls[1]).toEqual({ url: "https://zoom.us/rec/vtt", auth: "Bearer app-token" })
  })

  it("passes the event's token as Zoom asks", async () => {
    const urls: string[] = []
    const fetchImpl = ((input: URL | RequestInfo) => {
      urls.push(urlOf(input))
      return Promise.resolve(vtt())
    }) as typeof fetch
    await downloadRecordingText(null, { downloadUrl: "https://zoom.us/rec/vtt?type=a", downloadToken: "dl" }, fetchImpl)
    expect(urls).toEqual(["https://zoom.us/rec/vtt?type=a&access_token=dl"])
  })

  it("falls back to the app's token when the event's is refused", async () => {
    const tried: string[] = []
    const fetchImpl = ((input: URL | RequestInfo, init?: RequestInit) => {
      const url = urlOf(input)
      if (url.startsWith("https://zoom.us/oauth/token"))
        return Promise.resolve(Response.json({ access_token: "fresh", expires_in: 3600 }))
      const auth = new Headers(init?.headers).get("authorization")
      tried.push(auth ?? url)
      // An expired token gets Zoom's sign-in page rather than an error.
      return Promise.resolve(
        auth === "Bearer fresh" ? vtt() : new Response("<html>", { headers: { "Content-Type": "text/html" } }),
      )
    }) as typeof fetch
    const config = { accountId: "other-acct", clientId: "id", clientSecret: "secret" }
    const text = await downloadRecordingText(
      config,
      { downloadUrl: "https://zoom.us/rec/vtt", downloadToken: "old" },
      fetchImpl,
    )
    expect(text).toContain("HG: Hello.")
    expect(tried).toEqual(["https://zoom.us/rec/vtt?access_token=old", "Bearer fresh"])
  })

  it("sends the app's token to Zoom's domain only", async () => {
    expect(isZoomUrl("https://us06web.zoom.us/rec/download/abc")).toBe(true)
    expect(isZoomUrl("https://zoom.us/rec/download/abc")).toBe(true)
    expect(isZoomUrl("http://zoom.us/rec")).toBe(false)
    expect(isZoomUrl("https://zoom.us.example.com/rec")).toBe(false)
    expect(isZoomUrl("https://evilzoom.us/rec")).toBe(false)
    expect(isZoomUrl("not a link")).toBe(false)
    const urls: string[] = []
    const fetchImpl = ((input: URL | RequestInfo) => {
      urls.push(urlOf(input))
      return Promise.resolve(Response.json({ access_token: "app-token", expires_in: 3600 }))
    }) as typeof fetch
    const config = { accountId: "elsewhere", clientId: "id", clientSecret: "secret" }
    await expect(
      downloadRecordingText(config, { downloadUrl: "https://attacker.example/vtt", downloadToken: null }, fetchImpl),
    ).rejects.toThrow(/no download token/)
    expect(urls).toEqual([])
  })

  it("says what to do when the file cannot be downloaded", async () => {
    await expect(
      downloadRecordingText(null, { downloadUrl: "https://zoom.us/rec/vtt", downloadToken: null }),
    ).rejects.toThrow(/upload the transcript/)
    const refusing = (() => Promise.resolve(new Response("no", { status: 403 }))) as typeof fetch
    await expect(
      downloadRecordingText(null, { downloadUrl: "https://zoom.us/rec/vtt", downloadToken: "dl" }, refusing),
    ).rejects.toThrow("Zoom did not send the transcript (HTTP 403). Upload the transcript instead.")
  })
})
