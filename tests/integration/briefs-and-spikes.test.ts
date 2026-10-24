import { Timestamp } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { asIsoDate } from "@/core/dates"
import { parseSpikeList } from "@/core/spikes"
import type { AiConfig } from "@/server/ai"
import { publishDueBriefs, writeScheduledBrief } from "@/server/briefs"
import { notifyBriefOnce, notifySpikesOnce } from "@/server/notifications"
import { postSpikes, trackSpikes } from "@/server/spikes"
import { emulatorDb } from "./setup"

const { db, clear, close } = emulatorDb("briefs-and-spikes")

function fakeMessaging() {
  const sent: { fids: string[]; title: string; body: string }[] = []
  const messaging = {
    sendEachForMulticast: (message: { fids: string[]; data: { title: string; body: string } }) => {
      sent.push({ fids: [...message.fids].sort(), title: message.data.title, body: message.data.body })
      return Promise.resolve({
        successCount: message.fids.length,
        failureCount: 0,
        responses: message.fids.map(() => ({ success: true })),
      })
    },
  } as unknown as Messaging
  return { messaging, sent }
}

/** An AI endpoint that writes a fixed brief (or fails with `status`), keeping the data it was sent. */
function fakeAi(status = 200) {
  const data: string[] = []
  const fetchImpl = ((_input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
      messages: { content: { type: string; source?: { data?: string } }[] }[]
    }
    data.push(body.messages[0]?.content.find((b) => b.type === "document")?.source?.data ?? "")
    if (status >= 400)
      return Promise.resolve(
        Response.json({ type: "error", error: { type: "api_error", message: "down" } }, { status }),
      )
    return Promise.resolve(
      Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "test",
        content: [{ type: "text", text: JSON.stringify({ title: "9:40 AM update", body: "The Dow opened higher." }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    )
  }) as typeof fetch
  const config: AiConfig = { apiKey: "test", baseUrl: "https://ai.example.com", fetch: fetchImpl }
  return { config, data }
}

async function member(uid: string, options: { trial?: boolean; prefs?: Record<string, boolean> } = {}) {
  const ref = db.collection("members").doc(uid)
  await ref.set({
    email: `${uid}@example.com`,
    emailLower: `${uid}@example.com`,
    fullName: uid,
    role: "member",
    status: "active",
    prefs: options.prefs ?? {},
    createdAt: Timestamp.now(),
  })
  await ref
    .collection("periods")
    .doc("p1")
    .set({
      start: "2026-01-01",
      end: "2099-12-31",
      kind: options.trial ? "trial" : "quarterly",
      label: options.trial ? "Free trial" : "Q1 2026 to Q4 2099",
      note: null,
      createdAt: Timestamp.now(),
      createdBy: null,
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

const bar = (date: string, high: number, low: number) => ({ date, open: low, high, low, close: low, volume: 1000 })

beforeEach(async () => {
  await clear()
  await member("ava")
  await member("quiet", { prefs: { marketBrief: false, spikes: false } })
  await member("tara", { trial: true })
})

afterAll(close)

describe("the market brief", () => {
  const brief = (status: string, publishAt: Date | null) => ({
    title: "Pre-market view",
    body: "New strike prices will post for today.\n\nWatch fuel.",
    status,
    source: "admin",
    publishAt: publishAt ? Timestamp.fromDate(publishAt) : null,
    publishedAt: null,
    notify: true,
    notifiedAt: null,
    createdAt: Timestamp.now(),
    createdBy: "hg",
    updatedAt: Timestamp.now(),
  })

  it("posts a scheduled brief when its time comes, at that time", async () => {
    const due = new Date("2026-10-23T13:40:00Z")
    await db.doc("briefs/due").set(brief("scheduled", due))
    await db.doc("briefs/later").set(brief("scheduled", new Date("2026-10-23T14:30:00Z")))
    expect(await publishDueBriefs(db, new Date("2026-10-23T13:41:00Z"))).toEqual(["due"])
    const posted = await db.doc("briefs/due").get()
    expect(posted.get("status")).toBe("published")
    expect((posted.get("publishedAt") as Timestamp).toDate()).toEqual(due)
    expect((await db.doc("briefs/later").get()).get("status")).toBe("scheduled")
  })

  it("tells members with full access who keep it on, once", async () => {
    await db.doc("briefs/b1").set({ ...brief("published", null), publishedAt: Timestamp.now() })
    const { messaging, sent } = fakeMessaging()
    expect(await notifyBriefOnce(db, messaging, "b1", "event-1")).toBe(1)
    expect(await notifyBriefOnce(db, messaging, "b1", "event-2")).toBeNull()
    expect(sent).toEqual([
      { fids: ["fid-ava"], title: "Pre-market view", body: "New strike prices will post for today." },
    ])
  })

  it("is written by AI at its times once switched on, once per time", async () => {
    const ai = fakeAi()
    // 9:41 AM EDT on Friday, Oct 23 2026.
    const at = new Date("2026-10-23T13:41:00Z")
    expect(await writeScheduledBrief(db, ai.config, at)).toBeNull()

    await db.doc("settings/brief").set({ ai: { enabled: true, instructions: "Cover the indexes, then the targets." } })
    await db.doc("weeks/2026-10-19").set({
      weekStart: "2026-10-19",
      weekEnd: "2026-10-23",
      rows: {},
      indices: { DJI: { pfcp: 52002.41, high: 52310.88, low: 51744.02, close: 52215.16, range: 566.86, svi: 0.004 } },
      source: "provider",
      computedAt: Timestamp.now(),
    })
    await postSpikes(db, {
      title: "Spikes from Thu, Oct 22",
      rows: parseSpikeList("TSM 421.50 412.35", { date: asIsoDate("2026-10-22"), at: "open" }).rows,
      notify: false,
      actorUid: "hg",
    })

    const id = await writeScheduledBrief(db, ai.config, at)
    expect(id).not.toBeNull()
    const written = await db.doc(`briefs/${id ?? ""}`).get()
    expect(written.get("title")).toBe("9:40 AM update")
    expect(written.get("status")).toBe("published")
    expect(written.get("source")).toBe("ai")
    expect(ai.data[0]).toContain("Dow Jones: close 52,215.16")
    expect(ai.data[0]).toContain("TSM: 421.50, on the open 2026-10-22, close 412.35")

    // The run five minutes later, and the one after the window, write nothing more.
    expect(await writeScheduledBrief(db, ai.config, new Date("2026-10-23T13:46:00Z"))).toBeNull()
    expect(await writeScheduledBrief(db, ai.config, new Date("2026-10-23T13:57:00Z"))).toBeNull()
    expect((await db.collection("briefs").get()).size).toBe(1)
  })

  it("tries again at the next run when the AI fails", async () => {
    await db.doc("settings/brief").set({ ai: { enabled: true, instructions: "Cover the indexes." } })
    const at = new Date("2026-10-23T13:41:00Z")
    await expect(writeScheduledBrief(db, fakeAi(500).config, at)).rejects.toThrow()
    expect(await writeScheduledBrief(db, fakeAi().config, new Date("2026-10-23T13:46:00Z"))).not.toBeNull()
  })
})

describe("spikes", () => {
  const list = `Profit options
TSM 421.50 412.35
NVDA 218.53 212.21
INTC 88.11 85.49
DELL 469.00 452.95
MRVL 234.80 223.47`

  async function post(notify = true) {
    return postSpikes(db, {
      title: "Spikes from Thu, Oct 22",
      rows: parseSpikeList(list, { date: asIsoDate("2026-10-22"), at: "open" }).rows,
      notify,
      actorUid: "hg",
    })
  }
  const spike = async (symbol: string) =>
    (await db.collection("spikes").where("symbol", "==", symbol).get()).docs[0]?.data()

  it("posts the list in HG's order, already marking a stock that traded back to its spike", async () => {
    await db.doc("tickerBars/NVDA").set({
      symbol: "NVDA",
      bars: [bar("2026-10-22", 219, 210), bar("2026-10-23", 219.1, 214)],
      lastSplit: null,
      updatedAt: Timestamp.now(),
    })
    const id = await post()
    expect((await db.doc(`spikePosts/${id}`).get()).get("count")).toBe(5)
    expect(await spike("NVDA")).toMatchObject({ recoveredOn: "2026-10-23", sessionsToRecover: 1, direction: "up" })
    expect(await spike("TSM")).toMatchObject({ recoveredOn: null, group: "Profit options", line: 2 })
  })

  it("marks spikes as the stock trades back to them", async () => {
    await post()
    await db.doc("tickerBars/TSM").set({
      symbol: "TSM",
      bars: [bar("2026-10-22", 422, 410), bar("2026-10-23", 418, 411), bar("2026-10-26", 423, 415)],
      lastSplit: null,
      updatedAt: Timestamp.now(),
    })
    expect(await trackSpikes(db)).toBe(1)
    expect(await spike("TSM")).toMatchObject({ recoveredOn: "2026-10-26", sessionsToRecover: 2 })
    expect(await trackSpikes(db)).toBe(0)
  })

  it("tells members with full access who keep it on, once per list", async () => {
    const id = await post()
    const { messaging, sent } = fakeMessaging()
    expect(await notifySpikesOnce(db, messaging, id, "event-1")).toBe(1)
    expect(await notifySpikesOnce(db, messaging, id, "event-2")).toBeNull()
    expect(sent).toEqual([
      { fids: ["fid-ava"], title: "Spikes from Thu, Oct 22", body: "TSM, NVDA, INTC, DELL and 1 more" },
    ])
  })

  it("stays quiet when the list is posted without telling members", async () => {
    const id = await post(false)
    const { messaging, sent } = fakeMessaging()
    expect(await notifySpikesOnce(db, messaging, id, "event-1")).toBeNull()
    expect(sent).toEqual([])
  })
})
