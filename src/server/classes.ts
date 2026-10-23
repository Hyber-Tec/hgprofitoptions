/**
 * Class recaps: the AI summary of a class from its transcript, in place of Zoom's own summary. Shared by
 * the Cloud Function and (in local development) the web server.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { transcriptText } from "@/core/transcript"
import { AiError, summarizeClass, type AiConfig } from "./ai"
import { aiDocument } from "./documents"
import { COLLECTIONS, classRecapSchema, memberSettingsSchema, parseDoc } from "./model"
import { notifyClassRecap } from "./notifications"
import { ZoomError, downloadRecordingText, type ZoomApiConfig } from "./zoom"

/** The part of a Cloud Storage bucket this needs (the Admin SDK's Bucket). */
export interface TranscriptFiles {
  file(path: string): {
    download(): Promise<[Buffer]>
    save(data: string, options: { contentType: string; resumable: boolean }): Promise<unknown>
  }
}

export interface RecapServices {
  files: TranscriptFiles
  messaging: Messaging
  ai: AiConfig | null
  /** Downloads Zoom's transcripts when an event came without a token. */
  zoom: ZoomApiConfig | null
}

const recaps = (db: Firestore) => db.collection(COLLECTIONS.classRecaps)

/**
 * Writes the summary of a pending recap once: the first caller claims it, a trigger that fires twice
 * leaves. A Zoom transcript is downloaded and kept first. Failures are written to the recap so admins
 * see why. Returns true when the summary was written.
 */
export async function runClassSummary(
  db: Firestore,
  services: RecapServices,
  recapId: string,
  claimId: string,
): Promise<boolean> {
  const ref = recaps(db).doc(recapId)
  const recap = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const doc = snap.exists ? parseDoc(classRecapSchema, snap.id, snap.data()) : null
    if (doc?.transcript.status !== "pending") return null
    tx.update(ref, { "transcript.status": "running", "transcript.claimId": claimId })
    return doc
  })
  if (!recap) return false
  const fail = (message: string) =>
    ref.update({
      "transcript.status": "failed",
      "transcript.message": message,
      "transcript.finishedAt": Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  try {
    let { path, name, contentType } = recap.transcript
    let data: Uint8Array
    if (path) {
      const [stored] = await services.files.file(path).download()
      data = new Uint8Array(stored)
    } else if (recap.transcript.downloadUrls.length > 0) {
      const parts: string[] = []
      for (const downloadUrl of recap.transcript.downloadUrls)
        parts.push(
          await downloadRecordingText(services.zoom, { downloadUrl, downloadToken: recap.transcript.downloadToken }),
        )
      const text = parts.join("\n\n")
      path = `content/class-transcripts/${recap.id}.vtt`
      name = `${recap.title} ${recap.date}.vtt`
      contentType = "text/vtt"
      await services.files.file(path).save(text, { contentType: "text/vtt; charset=utf-8", resumable: false })
      // Kept before the AI runs, so trying again never depends on Zoom's links, which expire in a day.
      await ref.update({
        "transcript.path": path,
        "transcript.name": name,
        "transcript.contentType": contentType,
        "transcript.downloadUrls": [],
        "transcript.downloadToken": null,
      })
      data = new TextEncoder().encode(text)
    } else {
      await fail("This recap has no transcript.")
      return false
    }
    if (!services.ai) {
      await fail("AI is not set up on the server yet.")
      return false
    }
    const doc = aiDocument(name ?? "transcript.txt", data, contentType)
    const [tickers, settingsSnap] = await Promise.all([
      db.collection(COLLECTIONS.tickers).where("active", "==", true).select().get(),
      db.collection(COLLECTIONS.settings).doc("members").get(),
    ])
    const summary = await summarizeClass(services.ai, {
      title: recap.title,
      date: recap.date,
      transcript: doc.kind === "text" ? { ...doc, text: transcriptText(doc.text) } : doc,
      tickers: tickers.docs.map((d) => d.id).sort(),
    })
    const settings = memberSettingsSchema.safeParse(settingsSnap.data() ?? {})
    // A summary written again keeps whether members see it; a first one follows the setting.
    const publish = recap.summary ? recap.published : settings.success ? settings.data.recapsAutoPublish : true
    await ref.update({
      summary,
      published: publish,
      "transcript.status": "done",
      "transcript.message": null,
      "transcript.finishedAt": Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    if (publish) await notifyRecapOnce(db, services.messaging, recap.id)
    return true
  } catch (error) {
    const known = error instanceof AiError || error instanceof ZoomError
    await fail(known ? error.message : "Something went wrong while writing the recap. Try again.")
    if (!known) console.error(`Class recap ${recapId} failed:`, error)
    return false
  }
}

/** Tells members about a published recap, the first time only. Returns how many were notified. */
export async function notifyRecapOnce(db: Firestore, messaging: Messaging, recapId: string): Promise<number> {
  const ref = recaps(db).doc(recapId)
  const recap = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const doc = snap.exists ? parseDoc(classRecapSchema, snap.id, snap.data()) : null
    if (!doc?.published || !doc.summary || doc.notifiedAt) return null
    tx.update(ref, { notifiedAt: Timestamp.now() })
    return doc
  })
  return recap ? notifyClassRecap(db, messaging, recap) : 0
}
