import { readFileSync } from "node:fs"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { getBytes, ref, uploadBytes } from "firebase/storage"
import { afterAll, beforeAll, describe, it } from "vitest"

let env: RulesTestEnvironment
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF")

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-hgprofitoptions",
    storage: { rules: readFileSync("storage.rules", "utf8") },
  })
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "content/files/guide.pdf"), pdf, { contentType: "application/pdf" })
  })
})

afterAll(async () => {
  await env.cleanup()
})

const as = (uid: string, admin = false) => env.authenticatedContext(uid, admin ? { role: "admin" } : {}).storage()

describe("journal screenshots", () => {
  it("members upload images to their own folder", async () => {
    await assertSucceeds(uploadBytes(ref(as("ava"), "journal/ava/t1/chart.png"), png, { contentType: "image/png" }))
  })

  it("rejects other members' folders and non-images", async () => {
    await assertFails(uploadBytes(ref(as("ben"), "journal/ava/t1/chart.png"), png, { contentType: "image/png" }))
    await assertFails(uploadBytes(ref(as("ava"), "journal/ava/t1/notes.pdf"), pdf, { contentType: "application/pdf" }))
  })
})

describe("admin uploads", () => {
  it("admins upload alert images and member content", async () => {
    await assertSucceeds(uploadBytes(ref(as("hg", true), "alerts/a1.png"), png, { contentType: "image/png" }))
    await assertSucceeds(
      uploadBytes(ref(as("hg", true), "content/presentations/class.pdf"), pdf, { contentType: "application/pdf" }),
    )
  })

  it("members cannot", async () => {
    await assertFails(uploadBytes(ref(as("ava"), "alerts/a1.png"), png, { contentType: "image/png" }))
    await assertFails(uploadBytes(ref(as("ava"), "content/files/x.pdf"), pdf, { contentType: "application/pdf" }))
  })
})

describe("downloads", () => {
  it("go through the server, never straight from storage", async () => {
    await assertFails(getBytes(ref(as("hg", true), "content/files/guide.pdf")))
    await assertFails(getBytes(ref(as("ava"), "content/files/guide.pdf")))
  })
})
