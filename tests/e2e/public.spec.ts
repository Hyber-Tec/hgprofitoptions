import { expect, expectNoHorizontalScroll, test } from "./fixtures"

test("the home page keeps the free call for the end, after everything else", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Taking options trading to the next level, unlocking unlimited profits for the investor.",
    }),
  ).toBeVisible()
  // The class day comes from the schedule: the Sunday group class by default.
  await expect(page.getByText("Live class every Sunday")).toBeVisible()
  await expect(page.getByText(/starts every Sunday evening with a group class/)).toBeVisible()
  for (const name of [
    "Everything HG shares, in one place",
    "Everything you need to trade options with confidence",
    "Learn how HG reads a chart",
    "From the racetrack to the trading desk",
    "From your first call to your first plan",
    "Real members, real trades",
    "Questions before you join?",
    "Your journey toward trading excellence begins now",
  ]) {
    const heading = page.getByRole("heading", { level: 2, name })
    await heading.scrollIntoViewIfNeeded()
    await expect(heading).toBeVisible()
  }
  // HG wants visitors to see the whole page first: the only booking button is in the closing section.
  const closing = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Your journey toward trading excellence begins now" }),
  })
  await expect(closing.getByRole("link", { name: "Book a free 15-min call" })).toBeVisible()
  await expect(page.locator('main a[href="/book"]')).toHaveCount(1)
  await expect(page.locator('header a[href="/book"]')).toHaveCount(0)
  // Members still sign in from the header (the menu on a phone).
  if (test.info().project.name === "phone") await page.getByRole("button", { name: "Open menu" }).click()
  await expect(page.getByRole("link", { name: "Member login" }).first()).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("the site opens light, even on a dark device, and a picked theme sticks", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  const html = page.locator("html")
  await expect(html).toHaveClass(/\blight\b/)
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  await expect(html).toHaveClass(/\bdark\b/)
  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible()
})

test("the testimonials can be paused", async ({ page }) => {
  await page.goto("/#reviews")
  const pause = page.getByRole("button", { name: "Pause testimonials" })
  await pause.click()
  await expect(page.getByRole("button", { name: "Play testimonials" })).toHaveAttribute("aria-pressed", "true")
})

test("about and FAQ pages render", async ({ page }) => {
  await page.goto("/about")
  await expect(page.getByRole("heading", { level: 1, name: "Hubert Gaffney" })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await page.goto("/faq")
  await expect(page.getByRole("heading", { level: 1, name: "Frequently asked questions" })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("the About page shows every photo whole", async ({ page }) => {
  await page.goto("/about")
  const photos = page.locator("main img")
  await expect(photos).toHaveCount(4)
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded()
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    // A frame with a different shape than the photo cuts part of the photo off.
    const { alt, frame, photoShape } = await photo.evaluate((img: HTMLImageElement) => {
      const box = img.getBoundingClientRect()
      return { alt: img.alt, frame: box.width / box.height, photoShape: img.naturalWidth / img.naturalHeight }
    })
    expect(Math.abs(frame / photoShape - 1), alt).toBeLessThan(0.01)
  }
})

test("browsers that ask for /favicon.ico get the icon", async ({ request }) => {
  const response = await request.get("/favicon.ico")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toMatch(/^image\//)
})

test("unknown pages show the not-found page", async ({ page, allowConsole }) => {
  allowConsole(/status of 404/)
  const response = await page.goto("/no-such-page")
  expect(response?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible()
})

test("the member area asks visitors to sign in", async ({ page }) => {
  await page.goto("/members/targets")
  await expect(page).toHaveURL(/\/login\?next=%2Fmembers%2Ftargets/)
  await expect(page.getByRole("heading", { name: "Member login" })).toBeVisible()
})
