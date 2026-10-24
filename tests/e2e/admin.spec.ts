import { ACCOUNTS, expect, signIn, test } from "./fixtures"

test("HG invites a member, who creates an account from the link", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("heading", { level: 1, name: "Good to see you, Hubert" })).toBeVisible()

  await page.goto("/admin/members/new")
  await page.getByLabel("Full name").fill("Riley Quinn")
  await page.locator("#m-email").fill("riley.quinn@example.com")
  await page.locator("button[type=submit]").click()
  const link = await page.locator("input[readonly]").inputValue()
  expect(link).toContain("/welcome?invite=")

  const invited = await browser.newContext()
  const welcome = await invited.newPage()
  await welcome.goto(link)
  await welcome.getByRole("checkbox").first().click()
  await welcome.getByLabel("Password", { exact: true }).fill("Welcome-Riley-2026")
  await welcome.getByLabel("Confirm password").fill("Welcome-Riley-2026")
  await welcome.getByRole("button", { name: "Create account" }).click()
  await expect(welcome).toHaveURL(/\/members\?welcome=1$/)
  await expect(welcome.getByRole("heading", { level: 1, name: "Welcome, Riley" })).toBeVisible()
  await invited.close()
})

test("an alert HG publishes reaches members' feeds", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/alerts/new")
  await page.getByRole("button", { name: "Info", exact: true }).click()
  const title = `Class moves to 7:30 PM (${Date.now()})`
  await page.getByLabel("Title").fill(title)
  await page.getByLabel("Why, and what to watch").fill("Sunday's group class starts 30 minutes later this week.")
  await page.getByRole("button", { name: "Publish now" }).click()
  await expect(page).toHaveURL(/\/admin\/alerts\/(?!new)[^/]+$/)

  const member = await browser.newContext()
  const feed = await member.newPage()
  await signIn(feed, ACCOUNTS.active)
  await expect(feed).toHaveURL(/\/members$/)
  await feed.goto("/members/alerts")
  // A role locator skips hidden elements. Right after a page loads, the page can still sit in React's
  // hidden streaming container, waiting to move into place.
  await expect(feed.getByRole("link", { name: title, exact: true })).toBeVisible()
  await member.close()
})

test("members with the app open get HG's alert right away", async ({ page, browser }) => {
  const member = await browser.newContext()
  const open = await member.newPage()
  await signIn(open, ACCOUNTS.active)
  await expect(open).toHaveURL(/\/members$/)
  // The sidebar badge reads "Unread alerts: N", shows 9+ above nine and is hidden at zero.
  const badge = open.locator("[data-sidebar=menu-badge]")
  const shown = (n: number) => `Unread alerts: ${n > 9 ? "9+" : String(n)}`
  const before = (await badge.count()) > 0 ? Number((await badge.textContent())?.match(/\d+/)?.[0] ?? 0) : 0

  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/alerts/new")
  await page.getByRole("button", { name: "Info", exact: true }).click()
  const title = `Zoom link changed (${Date.now()})`
  await page.getByLabel("Title").fill(title)
  await page.getByLabel("Why, and what to watch").fill("Use the new link in the classroom page from tonight.")
  await page.getByRole("button", { name: "Publish now" }).click()
  await expect(page).toHaveURL(/\/admin\/alerts\/(?!new)[^/]+$/)

  // Without a reload, the open page shows a toast and counts the alert as unread.
  await expect(open.getByText(`Info · ${title}`)).toBeVisible()
  await expect(badge).toHaveText(shown(before + 1))
  await member.close()
})

test("HG sees every stock in a published update and can edit it", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/targets")
  await page.locator("table tbody tr").first().getByRole("link").click()
  await expect(page).toHaveURL(/\/admin\/targets\/\d{4}-\d{2}-\d{2}$/)
  await expect(page.locator('button[aria-haspopup="dialog"]:visible').first()).toBeVisible()
  await page.getByRole("link", { name: "Edit targets" }).click()
  await expect(page).toHaveURL(/\?edit=1$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Edit the")
  // The update comes back as text in the Google Doc's format, read into the preview.
  await expect(page.getByLabel("Update text")).toHaveValue(/^STRIKE PRICE TARGETS UPDATE /)
  await expect(page.getByRole("region").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Publish correction" })).toBeDisabled()
  await page.getByLabel("What changed").fill("Checked the levels")
  await expect(page.getByRole("button", { name: "Publish correction" })).toBeEnabled()
})

test("HG pastes the weekly Google Doc, fixes a line in one click and publishes", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/targets/new")
  const day = new Date(Date.now() - 2 * 86_400_000)
  const zone = "America/New_York"
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: zone }).format(day)
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(day)
  const doc = (...lines: string[]) =>
    [
      `STRIKE PRICE TARGETS UPDATE ${label.toUpperCase()}`,
      "PROFIT OPTIONS SMALL CHANNEL",
      "1. TSM- 472.50 or break of 465 PUT 1 457.50 10/23",
      "2. QQQZ- 50 or break of 48 PUT 47 10/23",
      ...lines,
    ].join("\n")
  const text = page.getByLabel("Update text")
  const publish = page.getByRole("button", { name: "Publish", exact: true })

  await text.fill(doc("3. ZZZZ- 10 or break of 9 PUT 8 10/23"))
  // The date comes from the title, and the heading finds the Small Channel category.
  await expect(page.getByLabel("Update date")).toHaveValue(iso)
  await expect(page.getByRole("region", { name: "Small Channel" })).toBeVisible()
  // A symbol the market data provider does not know is flagged before publishing.
  await expect(page.getByText("The market data provider does not know this ticker. Check the spelling.")).toBeVisible()
  await expect(publish).toBeDisabled()

  await text.fill(doc())
  await page.getByRole("button", { name: "Use put 457.50" }).click()
  await expect(text).toHaveValue(/1\. TSM- 472\.50 or break of 465 PUT 457\.50 10\/23/)
  await expect(page.getByText("Ready to publish")).toBeVisible()

  // An old date, so the latest update the other tests read stays the same.
  await page.getByLabel("Update date").fill("2025-01-08")
  await page.getByRole("switch", { name: /Tell members/ }).click()
  await publish.click()
  await expect(page).toHaveURL(/\/admin\/targets\/2025-01-08$/)
  await expect(page.getByRole("button", { name: "TSM: live prices and details" })).toBeVisible()

  // A ticker new to the list is added with its name once the update is out.
  await expect
    .poll(
      async () => {
        await page.goto("/admin/tickers")
        return page.getByText("QQQZ", { exact: true }).count()
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0)
})

test("HG adds a ticker with only its symbol and it shows in the tools at once", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/tickers")
  await page.getByRole("button", { name: "Add ticker" }).click()
  await page.getByLabel("Ticker", { exact: true }).fill("QQQX")
  await page.getByLabel("Channel (optional)").fill("2.5")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  // The name and prices come from the market data provider.
  await expect(page.getByText("QQQX added: QQQX Holdings Inc.")).toBeVisible()

  await page.goto("/members/channels")
  await page.getByLabel("Search ticker").fill("QQQX")
  await expect(page.getByRole("link", { name: "QQQX", exact: true })).toBeVisible()
  await expect(page.getByText("CH 2.50 · BOC 1.25")).toBeVisible()
})

test("a symbol the market data provider does not know is not added", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/tickers")
  await page.getByRole("button", { name: "Add ticker" }).click()
  await page.getByLabel("Ticker", { exact: true }).fill("ZZZZ")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText("ZZZZ was not found. Check the symbol and try again.")).toBeVisible()
})

test("HG narrows the member list and renews from the selection bar", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/members")
  const renew = page.getByRole("button", { name: "Renew next quarter" })
  await expect(renew).toHaveCount(0)
  await page.getByRole("checkbox", { name: "Select Ava Martin" }).click()
  await expect(page.getByText("1 member selected")).toBeVisible()
  await expect(renew).toBeEnabled()
  await expect(page.getByRole("button", { name: "Export 1 selected" })).toBeVisible()
  await page.getByRole("button", { name: "Clear selection" }).click()
  await expect(renew).toHaveCount(0)

  await expect(page.getByRole("combobox", { name: "Brokerage" })).toHaveCount(0)
  await page.getByRole("button", { name: /^Filters/ }).click()
  await page.getByRole("combobox", { name: "Brokerage" }).click()
  await page.getByRole("option", { name: "Not linked", exact: true }).click()
  await expect(page.getByRole("link", { name: /Chloe Nguyen/ })).toBeVisible()
  await expect(page.getByRole("link", { name: /Ava Martin/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Clear filters" }).click()
  await expect(page.getByRole("link", { name: /Ava Martin/ })).toBeVisible()
})

test("HG makes a data editor, who keeps the market data up to date but never sees members", async ({
  page,
  browser,
}) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/members")
  await page.getByRole("link", { name: /Julia Brooks/ }).click()
  await page.getByRole("button", { name: "Actions" }).click()
  await page.getByRole("menuitem", { name: "Make data editor" }).click()
  await expect(page.getByText("Now a data editor")).toBeVisible()

  const context = await browser.newContext()
  const julia = await context.newPage()
  await signIn(julia, "julia.brooks@example.com")
  // Data editors start on Market data, with only the data pages in the console.
  await expect(julia).toHaveURL(/\/admin\/market-data$/)
  for (const name of ["Strike targets", "Tickers", "Market data", "Leveraged ETFs"])
    await expect(julia.getByRole("link", { name, exact: true })).toBeVisible()
  await expect(julia.getByRole("link", { name: "Members", exact: true })).toHaveCount(0)
  expect((await julia.goto("/admin/members"))?.status()).toBe(404)
  // The member area stays open to them, to check the tools.
  await julia.goto("/members/channels")
  await expect(julia.getByRole("heading", { level: 1, name: "Median & Channel Chart" })).toBeVisible()
  await context.close()

  await page.reload()
  await page.getByRole("button", { name: "Actions" }).click()
  await page.getByRole("menuitem", { name: "Remove data editor role" }).click()
  await expect(page.getByText("Data editor role removed")).toBeVisible()
})

test("Update now brings market data up to date, and typed-in index values stay", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/market-data")
  await page.getByRole("button", { name: "Update now" }).click()
  await expect(page.getByRole("status")).toContainText(/Updated .*Up to date through the \w{3} \d{1,2}, \d{4} close/, {
    timeout: 60_000,
  })

  // HG types in the Dow's close for the week as he posted it; it is kept, marked as typed in.
  const monday = await page.getByLabel("Week", { exact: true }).inputValue()
  const day = (offset: number) => {
    const date = new Date(`${monday}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + offset)
    return date.toISOString().slice(0, 10)
  }
  const dow = page.getByRole("group", { name: "Dow Jones" })
  await dow.getByLabel("Close", { exact: true }).fill("52215.16")
  await dow.getByLabel("Last Friday's close").fill("52002.41")
  await dow.getByLabel("Week high").fill("52923.38")
  await dow
    .getByLabel("When")
    .first()
    .fill(`${day(2)}T12:30`)
  await dow.getByLabel("Week low").fill("51885.99")
  await dow
    .getByLabel("When")
    .last()
    .fill(`${day(0)}T09:55`)
  await expect(dow).toContainText("Gap vs last Friday: +212.75")
  await page.getByRole("button", { name: "Save index values" }).click()
  await expect(page.getByText("Index values saved")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("group", { name: "Dow Jones" })).toContainText("Typed in")
})
