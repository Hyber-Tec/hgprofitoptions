import { Timestamp } from "firebase-admin/firestore"
import { isoDateInZone, todayInMarketZone } from "@/core/dates"
import { classTitle } from "@/core/schedule"
import { classMeetingNumber } from "@/core/zoom"
import { COLLECTIONS } from "@/server/model"
import { transcriptFromEvent, urlValidationResponse, verifyZoomWebhook } from "@/server/zoom"
import { queueRecap } from "@/lib/classes"
import { getSiteSettings } from "@/lib/data/public"
import { getMemberSettings } from "@/lib/data/settings"
import { zoomWebhookSecret } from "@/lib/env.server"
import { adminDb } from "@/lib/firebase/admin"

/** One recap per occurrence of the meeting; Zoom's uuid can contain "/", so it is encoded. */
const recapId = (meetingUuid: string) => `zoom-${Buffer.from(meetingUuid).toString("base64url")}`

/**
 * Zoom's event notifications: the endpoint check, and the cloud recording transcript of the weekly
 * class, which queues its AI recap. Other meetings (one-on-ones) are ignored, so they are never
 * summarized. Zoom wants an answer within three seconds; the AI's work runs elsewhere.
 */
export async function POST(request: Request) {
  const secret = zoomWebhookSecret()
  if (!secret) return new Response("Not found", { status: 404 })
  const raw = await request.text()
  let body: { event?: unknown; payload?: { plainToken?: unknown } }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return new Response("Bad request", { status: 400 })
  }
  const signed = verifyZoomWebhook(
    secret,
    { signature: request.headers.get("x-zm-signature"), timestamp: request.headers.get("x-zm-request-timestamp") },
    raw,
  )
  if (!signed) return new Response("Unauthorized", { status: 401 })
  if (body.event === "endpoint.url_validation" && typeof body.payload?.plainToken === "string")
    return Response.json(urlValidationResponse(secret, body.payload.plainToken))
  if (body.event !== "recording.transcript_completed" && body.event !== "recording.completed")
    return new Response(null, { status: 204 })

  const transcript = transcriptFromEvent(body)
  const meeting = classMeetingNumber(await getMemberSettings())
  if (!transcript || !meeting || transcript.meetingId !== meeting) return new Response(null, { status: 204 })

  const id = recapId(transcript.meetingUuid)
  const ref = adminDb().collection(COLLECTIONS.classRecaps).doc(id)
  const date = transcript.startTime ? isoDateInZone(transcript.startTime) : todayInMarketZone()
  const { classSchedule } = await getSiteSettings()
  const queued = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    // A repeated event never replaces a recap that is written or on its way; a failed one starts over.
    // The recording's link is kept from whichever event brings it first.
    if (snap.exists && snap.get("transcript.status") !== "failed") {
      if (!snap.get("recordingUrl") && transcript.shareUrl) tx.update(ref, { recordingUrl: transcript.shareUrl })
      return false
    }
    const now = Timestamp.now()
    tx.set(ref, {
      title: classTitle(date, classSchedule),
      date,
      zoomMeetingUuid: transcript.meetingUuid,
      transcript: {
        status: "pending",
        source: "zoom",
        path: null,
        name: null,
        contentType: null,
        downloadUrls: transcript.downloadUrls,
        downloadToken: transcript.downloadToken,
        message: null,
        claimId: null,
        requestedAt: now,
        finishedAt: null,
      },
      summary: null,
      published: false,
      notifiedAt: null,
      recordingUrl: (snap.get("recordingUrl") as string | null | undefined) ?? transcript.shareUrl,
      recordingSentAt: (snap.get("recordingSentAt") as Timestamp | null | undefined) ?? null,
      recordingSentTo: (snap.get("recordingSentTo") as number | null | undefined) ?? null,
      createdAt: snap.exists ? (snap.get("createdAt") as Timestamp) : now,
      updatedAt: now,
    })
    return true
  })
  if (queued) queueRecap(id)
  return new Response(null, { status: 204 })
}
