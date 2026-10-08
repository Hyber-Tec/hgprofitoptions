import { readFileSync } from "node:fs"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { Timestamp, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"

let env: RulesTestEnvironment
const DAY = 24 * 60 * 60 * 1000

const window = (fromDaysAgo: number, untilInDays: number) => ({
  from: Timestamp.fromMillis(Date.now() - fromDaysAgo * DAY),
  until: Timestamp.fromMillis(Date.now() + untilInDays * DAY),
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-hgprofitoptions",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, "members/active"), { status: "active", role: "member", access: window(10, 30) })
    await setDoc(doc(db, "members/expired"), { status: "active", role: "member", access: window(120, -5) })
    await setDoc(doc(db, "members/suspended"), { status: "suspended", role: "member", access: window(10, 30) })
    await setDoc(doc(db, "members/upcoming"), { status: "active", role: "member", access: window(-5, 90) })
    await setDoc(doc(db, "members/never"), { status: "active", role: "member", access: null })
    await setDoc(doc(db, "members/hg"), { status: "active", role: "admin", access: null })
    await setDoc(doc(db, "tickers/TSM"), { symbol: "TSM" })
    await setDoc(doc(db, "alerts/live"), { status: "published", title: "Buy TSM" })
    await setDoc(doc(db, "alerts/draft"), { status: "draft", title: "Not yet" })
    await setDoc(doc(db, "targetUpdates/2026-10-07"), { status: "published" })
    await setDoc(doc(db, "targetUpdates/2026-10-14"), { status: "draft" })
    await setDoc(doc(db, "testimonials/shown"), { published: true })
    await setDoc(doc(db, "testimonials/hidden"), { published: false })
    await setDoc(doc(db, "settings/site"), { bookingUrl: "https://example.com" })
    await setDoc(doc(db, "settings/members"), { zoomUrl: "https://zoom.us/j/1" })
    await setDoc(doc(db, "config/targetGroups"), { groups: [] })
    await setDoc(doc(db, "config/secret"), { value: 1 })
    await setDoc(doc(db, "invites/someone@example.com"), { status: "pending" })
    await setDoc(doc(db, "auditLog/a1"), { action: "member.updated" })
    await setDoc(doc(db, "members/active/trades/t1"), { symbol: "TSM" })
    await setDoc(doc(db, "members/active/alertReads/live"), { alertId: "live" })
    await setDoc(doc(db, "members/active/privateNotes/t1"), { body: "mine", updatedAt: Timestamp.now() })
    await setDoc(doc(db, "snaptradeUsers/active"), { userSecret: "sealed" })
  })
})

const as = (uid: string, admin = false) => env.authenticatedContext(uid, admin ? { role: "admin" } : {}).firestore()
const anonymous = () => env.unauthenticatedContext().firestore()

describe("public content", () => {
  it("shows published testimonials and the site settings to anyone", async () => {
    await assertSucceeds(getDoc(doc(anonymous(), "testimonials/shown")))
    await assertSucceeds(getDoc(doc(anonymous(), "settings/site")))
  })

  it("hides unpublished testimonials", async () => {
    await assertFails(getDoc(doc(anonymous(), "testimonials/hidden")))
  })

  it("never accepts writes from browsers", async () => {
    await assertFails(setDoc(doc(as("hg", true), "testimonials/new"), { published: true }))
    await assertFails(updateDoc(doc(as("hg", true), "settings/site"), { bookingUrl: "x" }))
  })
})

describe("member content follows the access window", () => {
  it("lets a member with a current quarter read the tools", async () => {
    await assertSucceeds(getDoc(doc(as("active"), "tickers/TSM")))
    await assertSucceeds(getDoc(doc(as("active"), "settings/members")))
    await assertSucceeds(getDoc(doc(as("active"), "config/targetGroups")))
  })

  it("locks out expired, suspended, upcoming and signed-out visitors", async () => {
    for (const uid of ["expired", "suspended", "upcoming", "never"])
      await assertFails(getDoc(doc(as(uid), "tickers/TSM")))
    await assertFails(getDoc(doc(anonymous(), "tickers/TSM")))
  })

  it("lets admins read without a membership period", async () => {
    await assertSucceeds(getDoc(doc(as("hg", true), "tickers/TSM")))
  })

  it("only exposes published alerts and strike targets", async () => {
    await assertSucceeds(getDoc(doc(as("active"), "alerts/live")))
    await assertFails(getDoc(doc(as("active"), "alerts/draft")))
    await assertFails(getDoc(doc(as("hg", true), "alerts/draft")))
    await assertSucceeds(getDoc(doc(as("active"), "targetUpdates/2026-10-07")))
    await assertFails(getDoc(doc(as("active"), "targetUpdates/2026-10-14")))
  })

  it("does not expose other config documents", async () => {
    await assertFails(getDoc(doc(as("active"), "config/secret")))
  })
})

describe("member records", () => {
  it("lets members read their own record and trades, and admins read anyone's", async () => {
    await assertSucceeds(getDoc(doc(as("active"), "members/active")))
    await assertSucceeds(getDoc(doc(as("active"), "members/active/trades/t1")))
    await assertSucceeds(getDoc(doc(as("hg", true), "members/active/trades/t1")))
  })

  it("keeps members out of each other's records", async () => {
    await assertFails(getDoc(doc(as("expired"), "members/active")))
    await assertFails(getDoc(doc(as("expired"), "members/active/trades/t1")))
    await assertFails(getDoc(doc(as("expired"), "members/active/alertReads/live")))
  })

  it("never lets a browser change membership data", async () => {
    await assertFails(updateDoc(doc(as("active"), "members/active"), { role: "admin" }))
    await assertFails(setDoc(doc(as("active"), "members/active/trades/t2"), { symbol: "X" }))
    await assertFails(setDoc(doc(as("active"), "members/active/alertReads/x"), { alertId: "x" }))
    await assertFails(setDoc(doc(as("hg", true), "members/active/periods/p1"), { start: "2026-10-01" }))
  })
})

describe("private journal notes", () => {
  it("are readable and writable by their owner only", async () => {
    await assertSucceeds(getDoc(doc(as("active"), "members/active/privateNotes/t1")))
    await assertSucceeds(
      setDoc(doc(as("active"), "members/active/privateNotes/t2"), { body: "plan", updatedAt: serverTimestamp() }),
    )
  })

  it("are hidden from admins", async () => {
    await assertFails(getDoc(doc(as("hg", true), "members/active/privateNotes/t1")))
  })

  it("only accept a body and the server time", async () => {
    await assertFails(
      setDoc(doc(as("active"), "members/active/privateNotes/t3"), {
        body: "plan",
        updatedAt: serverTimestamp(),
        shared: true,
      }),
    )
    await assertFails(
      setDoc(doc(as("active"), "members/active/privateNotes/t3"), { body: "plan", updatedAt: Timestamp.now() }),
    )
    await assertFails(
      setDoc(doc(as("active"), "members/active/privateNotes/t3"), {
        body: "x".repeat(20001),
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe("server-only collections", () => {
  it("are closed to everyone, admins included", async () => {
    for (const path of ["invites/someone@example.com", "auditLog/a1", "snaptradeUsers/active"])
      await assertFails(getDoc(doc(as("hg", true), path)))
  })
})
