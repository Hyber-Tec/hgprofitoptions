/**
 * Zoom: the Meeting SDK signature that lets members join the class inside the site, the webhook checks,
 * and downloading the cloud recording transcript after a class (Server-to-Server OAuth).
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"

/** The Meeting SDK app's credentials (Client ID and Client Secret). */
export interface ZoomSdkConfig {
  sdkKey: string
  sdkSecret: string
}

/** The Server-to-Server OAuth app that downloads recordings. */
export interface ZoomApiConfig {
  accountId: string
  clientId: string
  clientSecret: string
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")

/**
 * A Meeting SDK signature (a JWT signed with the SDK secret). Role 0 joins as a participant. It is valid
 * for two hours; Zoom wants at least 30 minutes and at most 48 hours.
 */
export function meetingSdkSignature(
  config: ZoomSdkConfig,
  meetingNumber: string,
  role: 0 | 1 = 0,
  now: number = Date.now(),
): string {
  const iat = Math.floor(now / 1000) - 30
  const exp = iat + 2 * 60 * 60
  const input = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    appKey: config.sdkKey,
    mn: meetingNumber,
    role,
    iat,
    exp,
    tokenExp: exp,
  })}`
  return `${input}.${createHmac("sha256", config.sdkSecret).update(input).digest("base64url")}`
}

const hmacHex = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex")

/** The answer to Zoom's endpoint check: the plain token and its HMAC with the webhook secret. */
export function urlValidationResponse(
  secret: string,
  plainToken: string,
): { plainToken: string; encryptedToken: string } {
  return { plainToken, encryptedToken: hmacHex(secret, plainToken) }
}

/**
 * True when a webhook really comes from Zoom: x-zm-signature is "v0=" + HMAC-SHA256 of
 * "v0:{timestamp}:{raw body}" with the webhook secret, and the timestamp is within five minutes.
 */
export function verifyZoomWebhook(
  secret: string,
  headers: { signature: string | null; timestamp: string | null },
  rawBody: string,
  now: number = Date.now(),
): boolean {
  const { signature, timestamp } = headers
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false
  const sentAt = Number(timestamp) * (timestamp.length > 11 ? 1 : 1000)
  if (Math.abs(now - sentAt) > 5 * 60 * 1000) return false
  const expected = Buffer.from(`v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`)
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

const recordingEventSchema = z
  .object({
    event: z.string(),
    download_token: z.string().nullish(),
    payload: z
      .object({
        object: z
          .object({
            id: z.union([z.number(), z.string()]).transform(String),
            uuid: z.string(),
            topic: z.string().nullish(),
            start_time: z.string().nullish(),
            share_url: z.string().nullish(),
            recording_play_passcode: z.string().nullish(),
            recording_files: z
              .array(
                z
                  .object({
                    file_type: z.string().nullish(),
                    recording_type: z.string().nullish(),
                    file_extension: z.string().nullish(),
                    recording_start: z.string().nullish(),
                    download_url: z.string().nullish(),
                  })
                  .loose(),
              )
              .nullish(),
          })
          .loose(),
      })
      .loose(),
  })
  .loose()

export interface TranscriptReady {
  meetingId: string
  /** One occurrence of the meeting (a recurring meeting keeps its id). */
  meetingUuid: string
  topic: string | null
  startTime: Date | null
  /** One file per stretch of recording (stopping and restarting makes several), in order. */
  downloadUrls: string[]
  /** Short-lived token Zoom sends with the event, when the app's event subscription asks for one. */
  downloadToken: string | null
  /** The recording's share link, with its playback passcode so members are not asked for it. */
  shareUrl: string | null
}

/** Zoom's share link with the playback passcode added (Zoom's documented `pwd` parameter). */
export function recordingLink(shareUrl: string | null | undefined, passcode: string | null | undefined): string | null {
  if (!shareUrl) return null
  let url: URL
  try {
    url = new URL(shareUrl)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  if (passcode && !url.searchParams.has("pwd")) url.searchParams.set("pwd", passcode)
  return url.toString()
}

/** The transcript files in a recording event, or null when the event has none. */
export function transcriptFromEvent(body: unknown): TranscriptReady | null {
  const parsed = recordingEventSchema.safeParse(body)
  if (!parsed.success) return null
  const { object } = parsed.data.payload
  const files = (object.recording_files ?? [])
    .filter(
      (f) =>
        f.download_url &&
        (f.file_type?.toUpperCase() === "TRANSCRIPT" ||
          f.recording_type === "audio_transcript" ||
          f.file_extension?.toUpperCase() === "VTT"),
    )
    .sort((a, b) => (a.recording_start ?? "").localeCompare(b.recording_start ?? ""))
  const downloadUrls = [...new Set(files.map((f) => f.download_url as string))]
  if (downloadUrls.length === 0) return null
  const start = object.start_time ? new Date(object.start_time) : null
  return {
    meetingId: object.id,
    meetingUuid: object.uuid,
    topic: object.topic?.trim() || null,
    startTime: start && !Number.isNaN(start.getTime()) ? start : null,
    downloadUrls,
    downloadToken: parsed.data.download_token ?? null,
    shareUrl: recordingLink(object.share_url, object.recording_play_passcode),
  }
}

export class ZoomError extends Error {}

let cachedToken: { key: string; token: string; expiresAt: number } | null = null

/** A Server-to-Server OAuth access token, reused until a minute before it expires. */
export async function zoomAccessToken(config: ZoomApiConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = `${config.accountId}:${config.clientId}`
  if (cachedToken?.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token
  const url = new URL("https://zoom.us/oauth/token")
  url.searchParams.set("grant_type", "account_credentials")
  url.searchParams.set("account_id", config.accountId)
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new ZoomError(`Zoom sign-in failed with HTTP ${res.status}. Check the Zoom app's keys.`)
  const body = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await res.json())
  cachedToken = { key, token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return body.access_token
}

/** True for https links on Zoom's own domain, the only place the app's access token is sent. */
export function isZoomUrl(link: string): boolean {
  try {
    const url = new URL(link)
    return url.protocol === "https:" && (url.hostname === "zoom.us" || url.hostname.endsWith(".zoom.us"))
  } catch {
    return false
  }
}

/**
 * Downloads a recording file (a transcript) as text: with the token that came with the event (Zoom takes
 * it as an access_token parameter), or the app's own access token when there is none or it has expired
 * (it lasts a day), for links on Zoom's domain only. A sign-in page instead of the file counts as refused.
 */
export async function downloadRecordingText(
  config: ZoomApiConfig | null,
  file: { downloadUrl: string; downloadToken: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const options = { redirect: "follow", signal: AbortSignal.timeout(60_000) } as const
  const refused = (res: Response) =>
    res.status === 401 || res.status === 403 || (res.headers.get("content-type") ?? "").includes("text/html")
  let res: Response | null = null
  if (file.downloadToken) {
    const url = new URL(file.downloadUrl)
    url.searchParams.set("access_token", file.downloadToken)
    res = await fetchImpl(url, options)
  }
  if ((!res || refused(res)) && config && isZoomUrl(file.downloadUrl)) {
    const token = await zoomAccessToken(config, fetchImpl)
    res = await fetchImpl(file.downloadUrl, { ...options, headers: { Authorization: `Bearer ${token}` } })
  }
  if (!res)
    throw new ZoomError(
      "Zoom sent no download token with this recording. Add the Zoom recording keys, or upload the transcript.",
    )
  if (!res.ok || refused(res))
    throw new ZoomError(
      res.ok
        ? "Zoom's download link for the transcript has expired. Upload the transcript instead."
        : `Zoom did not send the transcript (HTTP ${res.status}). Upload the transcript instead.`,
    )
  return res.text()
}
