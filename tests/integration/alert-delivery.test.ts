import { Timestamp } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { deliverAlert, deliverStragglers } from "@/server/alerts"
import { emulatorDb } from "./setup"

const { db, clear, close } = emulatorDb("alert-delivery")
const options = { email: null, siteUrl: "https://example.com" }
const DAY = 24 * 60 * 60 * 1000

/** Records multicast calls and reports every device as reached. */
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

const prefs = {
  pushKinds: ["buy", "sell", "update", "watch", "info"],
  emailKinds: [],
  mutedSymbols: [],
  targetsPublished: true,
  membershipReminders: true,
}

async function member(uid: string, role: "admin" | "member") {
  const ref = db.collection("members").doc(uid)
  await ref.set({
    uid,
    email: `${uid}@example.com`,
    emailLower: `${uid}@example.com`,
    fullName: uid,
    role,
    status: "active",
    prefs,
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

async function alert(id: string, publishedAgoMs: number) {
  await db
    .collection("alerts")
    .doc(id)
    .set({
      kind: "info",
      status: "published",
      title: "Class moved",
      body: "Saturday class starts at 7:30 PM.",
      symbol: null,
      assetType: null,
      optionRight: null,
      strike: null,
      expiry: null,
      buyLow: null,
      buyHigh: null,
      stop: null,
      parentId: null,
      sendEmail: false,
      delivery: null,
      deliveryClaim: null,
      exits: [],
      createdBy: "hg",
      createdAt: Timestamp.now(),
      publishedAt: Timestamp.fromMillis(Date.now() - publishedAgoMs),
    })
}

beforeEach(async () => {
  await clear()
  await member("ava", "member")
  await member("hg", "admin")
})

afterAll(close)

describe("alert delivery", () => {
  it("notifies once, however many times it is triggered", async () => {
    await alert("a1", 0)
    const { messaging, sent } = fakeMessaging()
    const first = await deliverAlert(db, messaging, "a1", { ...options, claimId: "event-1" })
    const again = await deliverAlert(db, messaging, "a1", { ...options, claimId: "event-2" })
    expect(first).toMatchObject({ audience: 1, queued: 2, sent: 2, failed: 0 })
    expect(again).toBeNull()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.sort()).toEqual(["fid-ava", "fid-hg"])
  })

  it("lets a second sender take over a claim that went stale", async () => {
    await alert("a2", 0)
    await db
      .doc("alerts/a2")
      .update({ deliveryClaim: { id: "crashed", at: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000) } })
    const { messaging, sent } = fakeMessaging()
    expect(await deliverAlert(db, messaging, "a2", { ...options, claimId: "event-3" })).not.toBeNull()
    expect(sent).toHaveLength(1)
  })

  it("sends stragglers from the last day, after giving the trigger a moment", async () => {
    await alert("missed", 5 * 60 * 1000)
    await alert("just-now", 10 * 1000)
    await alert("last-week", 7 * DAY)
    const { messaging } = fakeMessaging()
    expect(await deliverStragglers(db, messaging, options)).toEqual(["missed"])
    expect((await db.doc("alerts/missed").get()).get("delivery")).not.toBeNull()
    expect((await db.doc("alerts/last-week").get()).get("delivery")).toBeNull()
  })
})
