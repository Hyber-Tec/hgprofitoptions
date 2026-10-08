import { ACCOUNTS, expect, expectNoHorizontalScroll, signIn, test } from "./fixtures"

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.active)
  await expect(page).toHaveURL(/\/members$/)
})

test("a stock page opens from a tool", async ({ page }) => {
  await page.goto("/members/targets")
  const stock = page.locator('a[href^="/members/stocks/"]:visible').first()
  const symbol = (await stock.getAttribute("href"))?.split("/").pop() ?? ""
  await stock.click()
  await expect(page).toHaveURL(new RegExp(`/members/stocks/${symbol}$`))
  await expect(page.getByRole("heading", { level: 1 })).toContainText(symbol)
})

test("an active member lands on their dashboard", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Ava" })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("alerts open to their detail page", async ({ page }) => {
  await page.goto("/members/alerts")
  await expect(page.getByRole("heading", { level: 1, name: "Alerts" })).toBeVisible()
  const first = page.locator('a[href^="/members/alerts/"]').first()
  const title = (await first.innerText()).split("\n")[0] ?? ""
  await first.click()
  await expect(page).toHaveURL(/\/members\/alerts\/[^/]+$/)
  await expect(page.getByText(title.trim()).first()).toBeVisible()
})

for (const [path, heading] of [
  ["/members/targets", "Strike Price Targets"],
  ["/members/channels", "Median & Channel Chart"],
  ["/members/market-data", "Key Market Data"],
  ["/members/etfs", "Leveraged ETF Guide"],
] as const) {
  test(`the ${heading} lists stocks`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()
    // A table on wide screens and a list on phones; either way each stock links to its page.
    await expect(page.locator('a[href^="/members/stocks/"]:visible').first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
}

test("the journal and portfolio open", async ({ page }) => {
  await page.goto("/members/journal")
  await expect(page.getByRole("heading", { level: 1, name: "Journal" })).toBeVisible()
  await page.goto("/members/portfolio")
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio" })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("members cannot open the admin console", async ({ page, allowConsole }) => {
  allowConsole(/status of 404/)
  const response = await page.goto("/admin")
  expect(response?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible()
})
