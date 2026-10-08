import { expect, expectNoHorizontalScroll, test } from "./fixtures"

test("the home page introduces the class and links to booking", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { level: 1, name: "Your journey toward trading excellence begins now" }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Real members, real trades" })).toBeVisible()
  await expect(page.locator('a[href="/book"]:visible').first()).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("about and FAQ pages render", async ({ page }) => {
  await page.goto("/about")
  await expect(page.getByRole("heading", { level: 1, name: "Hubert Gaffney" })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await page.goto("/faq")
  await expect(page.getByRole("heading", { level: 1, name: "Frequently asked questions" })).toBeVisible()
  await expectNoHorizontalScroll(page)
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
