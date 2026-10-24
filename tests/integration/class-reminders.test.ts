import { Timestamp } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_SITE_SETTINGS } from "@/server/model"
import { sendClassReminders } from "@/server/notifications"
import { emulatorDb } from "./setup"

const { db, clear, close } = emulatorDb("class-reminders")

/** Records who each multicast went to. */
function fakeMessaging() {
  const sent: { fids: string[]; title: string }[] = []
  const messaging = {
    sendEachForMulticast: (message: { fids: string[]; data: { title: string } }) => {
      sent.push({ fids: [...message.fids].sort(), title: message.data.title })
      return Promise.resolve({
        successCount: message.fids.length,
        failureCount: 0,
        responses: message.fids.map(() => ({ success: true })),
      })
    },
  } as unknown as Messaging
  return { messaging, sent }
}

async function member(uid: string, role: "admin" | "member", level: string, reminders = true) {
  const ref = db.collection("members").doc(uid)
  await ref.set({
    email: `${uid}@example.com`,
    emailLower: `${uid}@example.com`,
    fullName: uid,
    role,
    status: "active",
    level,
    prefs: { classReminders: reminders },
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

const remind = (messaging: Messaging, at: string) =>
  sendClassReminders(db, messaging, null, "https://example.com", new Date(at))

beforeEach(async () => {
  await clear()
  await db.collection("settings").doc("site").set(DEFAULT_SITE_SETTINGS)
  await db.collection("settings").doc("members").set({ zoomUrl: "https://zoom.us/j/123" })
  await member("ava", "member", "beginner")
  await member("bo", "member", "advanced")
  await member("hg", "admin", "beginner")
  await member("quiet", "member", "beginner", false)
})

afterAll(close)

describe("class reminders", () => {
  it("reminds everyone of the Sunday class once, an hour before", async () => {
    const { messaging, sent } = fakeMessaging()
    // 6:10 PM EDT on Sunday, Oct 25 2026: the 7 PM group class is 50 minutes away.
    expect(await remind(messaging, "2026-10-25T22:10:00Z")).toEqual([
      { title: "Group class", date: "2026-10-25", members: 3 },
    ])
    expect(sent).toEqual([{ fids: ["fid-ava", "fid-bo", "fid-hg"], title: "Group class today at 7:00 PM ET" }])
    // The next run, five minutes later, sends nothing more.
    expect(await remind(messaging, "2026-10-25T22:15:00Z")).toEqual([])
    expect(sent).toHaveLength(1)
  })

  it("waits until the class is within the reminder window", async () => {
    const { messaging, sent } = fakeMessaging()
    // 5:30 PM EDT: 90 minutes to go.
    expect(await remind(messaging, "2026-10-25T21:30:00Z")).toEqual([])
    expect(sent).toHaveLength(0)
  })

  it("reminds only beginners of a beginner session", async () => {
    const { messaging, sent } = fakeMessaging()
    // 8:45 AM EDT on Tuesday, Oct 27 2026.
    expect(await remind(messaging, "2026-10-27T12:45:00Z")).toEqual([
      { title: "Beginner session", date: "2026-10-27", members: 1 },
    ])
    expect(sent[0]?.fids).toEqual(["fid-ava"])
  })

  it("sends nothing for a session the market holiday cancels, or when reminders are off", async () => {
    const { messaging, sent } = fakeMessaging()
    // 8:45 AM EST on Thanksgiving, Thursday Nov 26 2026.
    expect(await remind(messaging, "2026-11-26T13:45:00Z")).toEqual([])
    await db.collection("settings").doc("site").update({ classReminderMinutes: null })
    expect(await remind(messaging, "2026-10-25T22:10:00Z")).toEqual([])
    expect(sent).toHaveLength(0)
  })
})
