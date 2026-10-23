import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Timestamp } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { AiConfig } from "@/server/ai"
import { notifyRecapOnce, runClassSummary, type TranscriptFiles } from "@/server/classes"
import { emulatorDb } from "./setup"

const { db, clear, close } = emulatorDb("class-recaps")

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
Hubert Gaffney: Tonight we look at TSM. It closed above 465 on Friday, so the target stays at 480.

2
00:00:05.500 --> 00:00:09.000
Hubert Gaffney: Remember the rule: wait for the close below the break of before you act.

3
00:00:09.500 --> 00:00:12.000
Ava Martin: Do we use the 4 PM close or the after-hours price?
`

/** Zoom's download server: the transcript for the right token, a sign-in page otherwise. */
let zoom: Server
let zoomUrl = ""
const downloads: string[] = []
beforeAll(async () => {
  zoom = createServer((req, res) => {
    downloads.push(req.url ?? "")
    if (new URL(req.url ?? "/", "http://zoom").searchParams.get("access_token") === "event-token") {
      res.writeHead(200, { "Content-Type": "text/vtt" })
      res.end(VTT)
    } else {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end("<html>Sign in</html>")
    }
  })
  await new Promise<void>((resolve) => zoom.listen(0, "127.0.0.1", resolve))
  zoomUrl = `http://127.0.0.1:${(zoom.address() as AddressInfo).port}/rec/download/transcript`
})

function fakeFiles() {
  const stored = new Map<string, string>()
  const files: TranscriptFiles = {
    file: (path) => ({
      download: () => Promise.resolve([Buffer.from(stored.get(path) ?? "")] as [Buffer]),
      save: (data) => {
        stored.set(path, data)
        return Promise.resolve()
      },
    }),
  }
  return { files, stored }
}

function fakeMessaging() {
  const sent: string[][] = []
  const messaging = {
    sendEachForMulticast: (message: { fids: string[] }) => {
      sent.push(message.fids)
      return Promise.resolve({
        successCount: message.fids.length,
        failureCount: 0,
        responses: message.fids.map(() => ({ success: true })),
      })
    },
  } as unknown as Messaging
  return { messaging, sent }
}

/** An AI endpoint that writes a fixed summary, or fails with `status`. */
function fakeAi(status = 200) {
  const transcripts: string[] = []
  const fetchImpl = ((_input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
      messages: { content: { type: string; source?: { data?: string } }[] }[]
    }
    transcripts.push(body.messages[0]?.content.find((b) => b.type === "document")?.source?.data ?? "")
    if (status >= 400)
      return Promise.resolve(
        Response.json({ type: "error", error: { type: "api_error", message: "down" } }, { status }),
      )
    const summary = {
      overview: "HG reviewed TSM and the close rule.",
      keyPoints: ["Wait for the close below the break of."],
      tickers: [{ symbol: "tsm", note: "Closed above 465; target 480." }],
      actionItems: [],
      questions: [{ question: "4 PM close or after hours?", answer: "The 4 PM close." }],
    }
    return Promise.resolve(
      Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "test",
        content: [{ type: "text", text: JSON.stringify(summary) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    )
  }) as typeof fetch
  const config: AiConfig = { apiKey: "test", baseUrl: "https://ai.example.com", fetch: fetchImpl }
  return { config, transcripts }
}

async function member(uid: string, classRecaps: boolean) {
  const ref = db.collection("members").doc(uid)
  await ref.set({
    email: `${uid}@example.com`,
    emailLower: `${uid}@example.com`,
    fullName: uid,
    role: "member",
    status: "active",
    prefs: { classRecaps },
    createdAt: Timestamp.now(),
  })
  await ref.collection("periods").doc("p1").set({
    start: "2026-01-01",
    end: "2099-12-31",
    kind: "quarterly",
    label: "Q1 2026 to Q4 2099",
    note: null,
    createdAt: Timestamp.now(),
    createdBy: "hg",
  })
  await ref
    .collection("fcmTokens")
    .doc(`${uid}-browser`)
    .set({
      token: `fid-${uid}`,
      userAgent: null,
      sessionId: null,
      createdAt: Timestamp.now(),
      lastSeenAt: Timestamp.now(),
    })
}

async function zoomRecap(id: string) {
  const now = Timestamp.now()
  await db
    .collection("classRecaps")
    .doc(id)
    .set({
      title: "Saturday class",
      date: "2026-10-24",
      zoomMeetingUuid: "uuid==",
      transcript: {
        status: "pending",
        source: "zoom",
        path: null,
        name: null,
        contentType: null,
        downloadUrls: [zoomUrl],
        downloadToken: "event-token",
        message: null,
        claimId: null,
        requestedAt: now,
        finishedAt: null,
      },
      summary: null,
      published: false,
      notifiedAt: null,
      createdAt: now,
      updatedAt: now,
    })
}

beforeEach(async () => {
  await clear()
  downloads.length = 0
  await member("ava", true)
  await member("ben", false)
  await db.collection("tickers").doc("TSM").set({ active: true })
})

afterAll(async () => {
  await new Promise((resolve) => zoom.close(resolve))
  await close()
})

describe("class recaps", () => {
  it("downloads Zoom's transcript, writes the recap, publishes it and tells members once", async () => {
    await zoomRecap("r1")
    const { files, stored } = fakeFiles()
    const { messaging, sent } = fakeMessaging()
    const ai = fakeAi()
    const services = { files, messaging, ai: ai.config, zoom: null }

    expect(await runClassSummary(db, services, "r1", "event-1")).toBe(true)
    expect(await runClassSummary(db, services, "r1", "event-2")).toBe(false)

    expect(downloads).toEqual(["/rec/download/transcript?access_token=event-token"])
    expect(stored.get("content/class-transcripts/r1.vtt")).toBe(VTT)
    // The AI reads the transcript as turns, without cue numbers and timestamps.
    expect(ai.transcripts).toHaveLength(1)
    expect(ai.transcripts[0]).toContain("Hubert Gaffney: Tonight we look at TSM.")
    expect(ai.transcripts[0]).not.toContain("-->")

    const recap = (await db.doc("classRecaps/r1").get()).data()
    expect(recap?.transcript).toMatchObject({
      status: "done",
      path: "content/class-transcripts/r1.vtt",
      downloadUrls: [],
      downloadToken: null,
    })
    expect(recap?.summary).toMatchObject({ tickers: [{ symbol: "TSM", note: "Closed above 465; target 480." }] })
    expect(recap?.published).toBe(true)
    expect(recap?.notifiedAt).not.toBeNull()
    // Ben turned class recap notifications off.
    expect(sent).toEqual([["fid-ava"]])
    expect(await notifyRecapOnce(db, messaging, "r1")).toBe(0)
  })

  it("waits for an admin when recaps are not shared right away", async () => {
    await db.doc("settings/members").set({ recapsAutoPublish: false })
    await zoomRecap("r2")
    const { files } = fakeFiles()
    const { messaging, sent } = fakeMessaging()
    expect(await runClassSummary(db, { files, messaging, ai: fakeAi().config, zoom: null }, "r2", "e")).toBe(true)
    expect((await db.doc("classRecaps/r2").get()).get("published")).toBe(false)
    expect(sent).toHaveLength(0)

    await db.doc("classRecaps/r2").update({ published: true })
    expect(await notifyRecapOnce(db, messaging, "r2")).toBe(1)
    expect(await notifyRecapOnce(db, messaging, "r2")).toBe(0)
    expect(sent).toEqual([["fid-ava"]])
  })

  it("writes why it failed, so an admin can try again", async () => {
    await zoomRecap("r3")
    await db.doc("classRecaps/r3").update({ "transcript.downloadToken": "expired" })
    const { files } = fakeFiles()
    const { messaging, sent } = fakeMessaging()
    expect(await runClassSummary(db, { files, messaging, ai: fakeAi().config, zoom: null }, "r3", "e")).toBe(false)
    const transcript = (await db.doc("classRecaps/r3").get()).get("transcript") as Record<string, unknown>
    expect(transcript.status).toBe("failed")
    expect(transcript.message).toBe(
      "Zoom's download link for the transcript has expired. Upload the transcript instead.",
    )
    expect(sent).toHaveLength(0)

    await db.doc("classRecaps/r3").update({ "transcript.downloadToken": "event-token", "transcript.status": "pending" })
    const ai = fakeAi(400)
    expect(await runClassSummary(db, { files, messaging, ai: ai.config, zoom: null }, "r3", "e2")).toBe(false)
    expect((await db.doc("classRecaps/r3").get()).get("transcript.message")).toBe(
      "The AI could not read this transcript. Upload it as a text, Word or PDF file and try again.",
    )
    // The transcript was kept before the AI ran, so trying again no longer needs Zoom.
    downloads.length = 0
    await db.doc("classRecaps/r3").update({ "transcript.status": "pending" })
    expect(await runClassSummary(db, { files, messaging, ai: fakeAi().config, zoom: null }, "r3", "e3")).toBe(true)
    expect(downloads).toEqual([])
  })
})
