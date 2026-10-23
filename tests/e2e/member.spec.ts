import { ACCOUNTS, expect, expectNoHorizontalScroll, signIn, test } from "./fixtures"

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.active)
  await expect(page).toHaveURL(/\/members$/)
})

test("a strike target opens its live order book, options chain and stock page", async ({ page }) => {
  await page.goto("/members/targets")
  await page.locator('button[aria-haspopup="dialog"]:visible').first().click()
  const panel = page.getByRole("dialog")
  const symbol = (await panel.getByRole("heading").first().innerText()).split(/\s/)[0] ?? ""
  // Bid, ask and last for the shares.
  await expect(panel.getByRole("rowheader", { name: `${symbol} shares` })).toBeVisible()
  // The chain for the target's expiry, with HG's call and put strikes marked and the price between strikes.
  const chain = panel.getByRole("table", { name: new RegExp(`^${symbol} calls and puts`) })
  await expect(chain.getByRole("rowheader", { name: /Target/ })).toBeVisible()
  await expect(chain.getByRole("rowheader", { name: /Put$/ })).toBeVisible()
  await expect(chain.getByRole("row", { name: new RegExp(`^${symbol} is at \\$`) })).toHaveCount(1)
  await expect(panel.getByText("Loading")).toHaveCount(0)
  await panel.getByRole("link", { name: `${symbol} stock page` }).click()
  await expect(page).toHaveURL(new RegExp(`/members/stocks/${symbol}$`))
  await expect(page.getByRole("heading", { level: 1 })).toContainText(symbol)
})

test("a page streams in without leaving a second copy of itself behind", async ({ page }) => {
  // The page arrives in a hidden container and is moved into place a moment later. If a context value
  // changes in between (a provider updating as the page loads), React renders that part again in the
  // browser, and the server's copy lingers beside it: two of every element, so text locators match
  // twice. A slow CPU, like a busy CI machine, makes that timing likely. This never fails when the app
  // is right, and catches the mistake on most runs.
  await page.addInitScript(() => {
    const w = window as unknown as { twins: string[] }
    w.twins = []
    new MutationObserver(() => {
      const main = document.getElementById("main")
      for (const el of document.querySelectorAll('div[hidden][id^="S:"] [id]')) {
        const twin = document.getElementById(el.id)
        if (main && twin && twin !== el && main.contains(twin)) w.twins.push(el.id)
      }
    }).observe(document, { childList: true, subtree: true })
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  for (let i = 0; i < 10; i++) {
    await page.goto("/members/settings")
    await expect(page.locator("#main #p-email")).toBeVisible()
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as unknown as { twins: string[] }).twins)).toEqual([])
  }
})

test("the sidebar opens the way it was left, straight from the server", async ({ page, isMobile }) => {
  test.skip(isMobile, "On a phone the sidebar is a sheet that starts closed.")
  // Firebase Hosting forwards no cookie but the session's, so the choice is kept with the account.
  const collapsedOnServer = async () =>
    /data-collapsible="icon"/.test(await (await page.request.get("/members/journal")).text())
  const trigger = page.locator("[data-sidebar=trigger]")
  await trigger.click()
  await expect.poll(collapsedOnServer).toBe(true)
  expect((await page.context().cookies()).map((c) => c.name)).not.toContain("sidebar_state")
  await trigger.click()
  await expect.poll(collapsedOnServer).toBe(false)
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
