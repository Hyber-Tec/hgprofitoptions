import { ACCOUNTS, expect, expectNoHorizontalScroll, signIn, test } from "./fixtures"

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.active)
  await expect(page).toHaveURL(/\/members$/)
})

test("a strike target opens its live order book and the stock page", async ({ page }) => {
  await page.goto("/members/targets")
  await page.locator('button[aria-haspopup="dialog"]:visible').first().click()
  const panel = page.getByRole("dialog")
  const symbol = (await panel.getByRole("heading").first().innerText()).split(/\s/)[0] ?? ""
  // Bid, ask and last for the shares, the call at the target and the put.
  await expect(panel.getByRole("columnheader", { name: "Bid" })).toBeVisible()
  await expect(panel.getByRole("rowheader", { name: `${symbol} shares` })).toBeVisible()
  await expect(panel.getByRole("rowheader", { name: /call$/ })).toBeVisible()
  await expect(panel.getByRole("rowheader", { name: /put$/ })).toBeVisible()
  await expect(panel.getByText("Loading")).toHaveCount(0)
  await panel.getByRole("link", { name: `${symbol} stock page` }).click()
  await expect(page).toHaveURL(new RegExp(`/members/stocks/${symbol}$`))
  await expect(page.getByRole("heading", { level: 1 })).toContainText(symbol)
})

test("an active member lands on their dashboard", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Ava" })).toBeVisible()
  // The sign-in page opens light like the site; the member area opens dark.
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await expectNoHorizontalScroll(page)
})

test("alerts open to their detail page", async ({ page }) => {
  await page.goto("/members/alerts")
  await expect(page.getByRole("heading", { level: 1, name: "Alerts" })).toBeVisible()
  const first = page.getByRole("article").first().getByRole("link")
  const title = (await first.innerText()).trim()
  await first.click()
  await expect(page).toHaveURL(/\/members\/alerts\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible()
})

for (const [path, heading, stock] of [
  // Strike targets open a panel with the order book; the other tools link each stock to its page.
  ["/members/targets", "Strike Price Targets", 'button[aria-haspopup="dialog"]:visible'],
  ["/members/channels", "Median & Channel Chart", 'a[href^="/members/stocks/"]:visible'],
  ["/members/market-data", "Key Market Data", 'a[href^="/members/stocks/"]:visible'],
  ["/members/etfs", "Leveraged ETF Guide", 'a[href^="/members/stocks/"]:visible'],
] as const) {
  test(`the ${heading} lists stocks`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()
    await expect(page.locator(stock).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
}

test("the channel chart lays out each stock's ladder around its last close", async ({ page }) => {
  await page.goto("/members/channels")
  const first = page
    .locator("ul > li")
    .filter({ has: page.locator('a[href^="/members/stocks/"]') })
    .first()
  await expect(first.getByText(/^CH [\d.,]+ · BOC [\d.,]+$/)).toBeVisible()
  await expect(first.getByRole("img", { name: /^Price \$/ }).filter({ visible: true })).toBeVisible()
})

test("Key Market Data shows HG's columns without the extras", async ({ page }) => {
  await page.goto("/members/market-data")
  const headers = page.locator("table thead th:visible")
  if ((await headers.count()) > 0)
    await expect(headers).toHaveText(["Ticker", "PFCP", "High", "Low", "Close", "Range", "SVI"])
  await expect(page.getByText("Chg %")).toHaveCount(0)
})

test("the journal and portfolio open", async ({ page }) => {
  await page.goto("/members/journal")
  await expect(page.getByRole("heading", { level: 1, name: "Journal" })).toBeVisible()
  await page.goto("/members/portfolio")
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio" })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("the journal lists trades plainly and keeps the extra filters behind Filters", async ({ page }) => {
  await page.goto("/members/journal")
  const trades = page.getByRole("list", { name: "Trades" }).getByRole("link")
  await expect(trades.first()).toBeVisible()
  await page.getByRole("button", { name: "Closed", exact: true }).click()
  await expect(trades.getByText("Open", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("combobox", { name: "Outcome" })).toHaveCount(0)
  await page.getByRole("button", { name: /^Filters/ }).click()
  await page.getByRole("combobox", { name: "Outcome" }).click()
  await page.getByRole("option", { name: "Losses", exact: true }).click()
  await expect(page.getByText(/closed trades made -\$/)).toBeVisible()
  await page.getByRole("button", { name: "Clear filters" }).click()
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0)
  await expectNoHorizontalScroll(page)
})

test("members cannot open the admin console", async ({ page, allowConsole }) => {
  allowConsole(/status of 404/)
  const response = await page.goto("/admin")
  expect(response?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible()
})
