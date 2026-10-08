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
  await page.getByLabel("Why, and what to watch").fill("Saturday's class starts 30 minutes later this week.")
  await page.getByRole("button", { name: "Publish now" }).click()
  await expect(page).toHaveURL(/\/admin\/alerts\/(?!new)[^/]+$/)

  const member = await browser.newContext()
  const feed = await member.newPage()
  await signIn(feed, ACCOUNTS.active)
  await expect(feed).toHaveURL(/\/members$/)
  await feed.goto("/members/alerts")
  await expect(feed.getByText(title)).toBeVisible()
  await member.close()
})

test("HG sees every stock in a published update and can edit it", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/targets")
  await page.locator("table tbody tr").first().getByRole("link").click()
  await expect(page).toHaveURL(/\/admin\/targets\/\d{4}-\d{2}-\d{2}$/)
  await expect(page.locator('a[href^="/members/stocks/"]:visible').first()).toBeVisible()
  await page.getByRole("link", { name: "Edit targets" }).click()
  await expect(page).toHaveURL(/\?edit=1$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Edit the")
  await expect(page.getByRole("button", { name: "Add ticker" }).first()).toBeVisible()
})
