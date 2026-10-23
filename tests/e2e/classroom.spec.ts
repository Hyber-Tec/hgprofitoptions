import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { parseEnv } from "node:util"
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test"
import { ACCOUNTS, expect, signIn, test } from "./fixtures"

const TRANSCRIPT = "tests/e2e/files/class-transcript.vtt"
const env = parseEnv(readFileSync(".env.e2e", "utf8")) as Record<string, string>
const WEBHOOK_SECRET = env.ZOOM_WEBHOOK_SECRET ?? ""
const CLASS_MEETING = "81234567890"

/** Admin > Settings: the class's Zoom link (the meeting ID comes from it) and passcode. */
async function setClassMeeting(page: Page) {
  await page.goto("/admin/settings")
  await page.getByLabel("Class Zoom link").fill(`https://us06web.zoom.us/j/${CLASS_MEETING}?pwd=abc`)
  await page.getByLabel("Meeting ID").fill("")
  await page.getByLabel("Passcode").fill("HG2026")
  await page.getByRole("button", { name: "Save member settings" }).click()
  await expect(page.getByText("Member settings saved")).toBeVisible()
}

/** Posts an event to the webhook, signed the way Zoom signs it. */
function postZoomEvent(request: APIRequestContext, event: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`
  return request.post("/api/zoom/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-zm-signature": signature, "x-zm-request-timestamp": timestamp },
  })
}

function transcriptEvent(meetingId: string, uuid: string, downloadUrl: string) {
  return {
    event: "recording.transcript_completed",
    event_ts: Date.now(),
    download_token: "zoom-download-token",
    payload: {
      account_id: "hg-account",
      object: {
        id: Number(meetingId),
        uuid,
        topic: "HG Profit Options class",
        start_time: "2026-10-24T22:00:00Z",
        recording_files: [
          {
            file_type: "TRANSCRIPT",
            file_extension: "VTT",
            recording_start: "2026-10-24T22:00:04Z",
            download_url: downloadUrl,
          },
        ],
      },
    },
  }
}

/** Stands in for Zoom's web client: records how the frame starts and joins the meeting. */
async function stubZoomClient(context: BrowserContext) {
  await context.route("https://source.zoom.us/**", (route) => {
    const script = route.request().url().includes("/zoom-meeting-")
      ? `window.ZoomMtg = {
          preLoadWasm() {}, prepareWebSDK() {},
          init(options) { window.zoomInit = { leaveUrl: options.leaveUrl }; options.success() },
          join(options) { window.zoomJoin = options; document.body.insertAdjacentHTML("beforeend", "<p>In the meeting</p>") },
        }`
      : ""
    return route.fulfill({ status: 200, contentType: "application/javascript", body: script })
  })
}

test("HG adds a class recap from a transcript, and members read it", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/recaps/new")
  await page.getByLabel("Date of the class").fill("2026-10-17")
  await expect(page.getByLabel("Title")).toHaveValue("Saturday class")
  await page.locator('input[type="file"]').setInputFiles(TRANSCRIPT)
  await expect(page.getByText("class-transcript.vtt")).toBeVisible()
  await page.getByRole("button", { name: "Write the recap" }).click()
  await expect(page).toHaveURL(/\/admin\/recaps\/(?!new)[^/]+$/)
  await expect(page.getByText("Key points")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Members can read it")).toBeVisible()

  // HG corrects the AI and the members see the correction.
  await page.getByRole("button", { name: "Edit" }).click()
  await page.getByLabel("Overview").fill("HG reviewed the TSM and NVDA targets and the 4 PM close rule.")
  await page.getByRole("button", { name: "Save the recap" }).click()
  await expect(page.getByText("Recap saved")).toBeVisible()

  const member = await browser.newContext()
  const ava = await member.newPage()
  await signIn(ava, ACCOUNTS.active)
  await expect(ava).toHaveURL(/\/members$/)
  await ava.goto("/members/classroom")
  await ava
    .getByRole("link", { name: /Saturday class/ })
    .filter({ hasText: "Oct 17, 2026" })
    .click()
  await expect(ava).toHaveURL(/\/members\/classroom\/recaps\/[^/]+$/)
  await expect(ava.getByText("HG reviewed the TSM and NVDA targets and the 4 PM close rule.")).toBeVisible()
  await expect(ava.getByRole("region", { name: "Questions from the class" })).toContainText(
    "Do we use the 4 PM close or the after-hours price for the break of level?",
  )

  // A hidden recap is gone for members.
  await page.getByRole("button", { name: "Hide from members" }).click()
  await expect(page.getByText("Hidden from members", { exact: true })).toBeVisible()
  await ava.reload()
  await expect(ava.getByRole("heading", { name: "This page does not exist" })).toBeVisible()
  await member.close()
})

test.describe("Zoom", () => {
  let zoom: Server
  let downloadUrl = ""
  test.beforeAll(async () => {
    const transcript = readFileSync(TRANSCRIPT, "utf8")
    zoom = createServer((req, res) => {
      const token = new URL(req.url ?? "/", "http://zoom").searchParams.get("access_token")
      res.writeHead(token === "zoom-download-token" ? 200 : 401, { "Content-Type": "text/vtt" })
      res.end(token === "zoom-download-token" ? transcript : "")
    })
    await new Promise<void>((resolve) => zoom.listen(0, "127.0.0.1", resolve))
    downloadUrl = `http://127.0.0.1:${(zoom.address() as AddressInfo).port}/rec/download/transcript`
  })
  test.afterAll(() => new Promise((resolve) => zoom.close(resolve)))

  test("checks Zoom's signature and makes recaps of the class meeting only", async ({ page, request }) => {
    await signIn(page, ACCOUNTS.admin)
    await expect(page).toHaveURL(/\/admin$/)
    await setClassMeeting(page)

    const check = await postZoomEvent(request, { event: "endpoint.url_validation", payload: { plainToken: "abc" } })
    expect(await check.json()).toEqual({
      plainToken: "abc",
      encryptedToken: createHmac("sha256", WEBHOOK_SECRET).update("abc").digest("hex"),
    })
    const forged = await postZoomEvent(request, transcriptEvent(CLASS_MEETING, "forged==", downloadUrl), "wrong")
    expect(forged.status()).toBe(401)
    const oneOnOne = await postZoomEvent(request, transcriptEvent("99999999999", "one-on-one==", downloadUrl))
    expect(oneOnOne.status()).toBe(204)
    const recorded = await postZoomEvent(request, transcriptEvent(CLASS_MEETING, "class-oct-24==", downloadUrl))
    expect(recorded.status()).toBe(204)
    // Zoom retries events; the class still gets one recap.
    expect((await postZoomEvent(request, transcriptEvent(CLASS_MEETING, "class-oct-24==", downloadUrl))).status()).toBe(
      204,
    )

    await page.goto("/admin/recaps")
    const rows = page.getByRole("row").filter({ hasText: "Oct 24, 2026" })
    await expect(rows).toHaveCount(1)
    await rows.getByRole("link", { name: "Saturday class" }).click()
    await expect(page.getByText("Key points")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Oct 24, 2026, from Zoom's transcript")).toBeVisible()
  })

  test("members join the class inside the site", async ({ page, browser }) => {
    await signIn(page, ACCOUNTS.admin)
    await expect(page).toHaveURL(/\/admin$/)
    await setClassMeeting(page)

    const member = await browser.newContext()
    await stubZoomClient(member)
    const ava = await member.newPage()
    await signIn(ava, ACCOUNTS.active)
    await expect(ava).toHaveURL(/\/members$/)
    await ava.goto("/members/classroom")
    await ava.getByRole("link", { name: "Join class" }).first().click()
    await expect(ava).toHaveURL(/\/members\/classroom\/live$/)

    const frame = ava.frameLocator('iframe[title="Live class"]')
    await expect(frame.getByText("In the meeting")).toBeVisible()
    const live = ava.frames().find((f) => f.url().endsWith("/members/classroom/live/frame"))
    const join =
      (await live?.evaluate(() => (window as unknown as { zoomJoin: Record<string, string> }).zoomJoin)) ?? {}
    expect(join).toMatchObject({ meetingNumber: CLASS_MEETING, passWord: "HG2026", userName: "Ava Martin" })
    const claims = JSON.parse(Buffer.from(join.signature?.split(".")[1] ?? "", "base64url").toString()) as Record<
      string,
      unknown
    >
    expect(claims).toMatchObject({ appKey: env.ZOOM_SDK_KEY, mn: CLASS_MEETING, role: 0 })

    // Leaving in Zoom brings the whole page back to the Classroom.
    await live?.evaluate(() => {
      window.location.href = (window as unknown as { zoomInit: { leaveUrl: string } }).zoomInit.leaveUrl
    })
    await expect(ava).toHaveURL(/\/members\/classroom$/)
    await member.close()

    // Members without access get no meeting signature.
    const expired = await browser.newContext()
    const diego = await expired.newPage()
    await signIn(diego, ACCOUNTS.expired)
    await expect(diego).toHaveURL(/\/members\/inactive$/)
    expect((await diego.request.get("/members/classroom/live/frame")).status()).toBe(404)
    await expired.close()
  })
})
