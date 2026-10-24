import { Timestamp } from "firebase-admin/firestore"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { asIsoDate, todayInMarketZone } from "@/core/dates"
import { addPeriod, readPeriods, recomputeAccess } from "@/server/members"
import { emulatorDb } from "./setup"

const { db, clear, close } = emulatorDb("trial")
const today = todayInMarketZone()

async function trialMember(uid: string, start: string, end: string) {
  const ref = db.collection("members").doc(uid)
  await ref.set({
    email: `${uid}@example.com`,
    emailLower: `${uid}@example.com`,
    fullName: uid,
    role: "member",
    status: "active",
    createdAt: Timestamp.now(),
  })
  await ref.collection("periods").doc("trial").set({
    start,
    end,
    kind: "trial",
    label: "Free trial",
    note: null,
    createdAt: Timestamp.now(),
    createdBy: null,
  })
  await recomputeAccess(db, uid, asIsoDate(today))
}

beforeEach(clear)
afterAll(close)

describe("free trials", () => {
  it("marks the access window as a trial, so the rules hold back HG's posts", async () => {
    await trialMember("tara", "2026-01-01", "2099-12-31")
    const access = (await db.doc("members/tara").get()).get("access") as { trial: boolean }
    expect(access.trial).toBe(true)
    // A free trial is not membership yet.
    expect((await db.doc("members/tara").get()).get("memberSince")).toBeNull()
  })

  it("ends the day before a quarter HG adds, which then counts as membership", async () => {
    await trialMember("tara", "2026-01-01", "2099-12-31")
    await addPeriod(
      db,
      "tara",
      { start: asIsoDate("2026-10-01"), end: asIsoDate("2026-12-31"), kind: "quarterly", label: "Q4 2026" },
      "hg",
    )
    const periods = await readPeriods(db, "tara")
    expect(periods.map((p) => [p.kind, p.start, p.end])).toEqual([
      ["trial", "2026-01-01", "2026-09-30"],
      ["quarterly", "2026-10-01", "2026-12-31"],
    ])
    expect((await db.doc("members/tara").get()).get("memberSince")).toBe("2026-10-01")
  })

  it("goes when the quarter starts before the trial", async () => {
    await trialMember("tara", "2026-10-23", "2026-10-29")
    await addPeriod(
      db,
      "tara",
      { start: asIsoDate("2026-10-01"), end: asIsoDate("2026-12-31"), kind: "quarterly", label: "Q4 2026" },
      "hg",
    )
    expect((await readPeriods(db, "tara")).map((p) => p.kind)).toEqual(["quarterly"])
  })
})
