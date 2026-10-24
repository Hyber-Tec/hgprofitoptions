import { ACCOUNTS, expect, expectNoHorizontalScroll, signIn, test } from "./fixtures"

test("HG pastes a spike list; members see it in Alerts and on each stock's page", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/spikes")
  await page.getByLabel("The list").fill("Profit options\nAAPL 999.50 256.40\nMSFT 1,030.10 / 521.80\nGE ? 298.60")
  // The preview reads HG's message as written and says which line it leaves out.
  await expect(page.getByText("2 spikes to post")).toBeVisible()
  await expect(page.getByText("GE has no spike price")).toBeVisible()
  await page.getByRole("button", { name: "Post 2 spikes" }).click()
  await expect(page.getByText("2 spikes posted")).toBeVisible()

  const context = await browser.newContext()
  const member = await context.newPage()
  await signIn(member, ACCOUNTS.active)
  await expect(member).toHaveURL(/\/members$/)
  await member.goto("/members/alerts/spikes")
  await expect(
    member.getByRole("navigation", { name: "Alerts" }).getByRole("link", { name: "Spikes", exact: true }),
  ).toHaveAttribute("aria-current", "page")
  await expect(member.getByRole("cell", { name: "1,030.10" }).first()).toBeVisible()
  // HG's study method sits beside the list.
  await expect(member.getByText("How to study a spike")).toBeVisible()
  await expect(member.getByRole("listitem").filter({ hasText: "Identify the channel that has gapped" })).toBeVisible()
  // A stock opens on the 5-day chart in 5-minute candles that HG studies spikes on.
  await member.getByRole("link", { name: "AAPL", exact: true }).first().click()
  await expect(member).toHaveURL(/\/members\/stocks\/AAPL\?chart=5d$/)
  await expect(member.getByRole("list", { name: "Chart key" })).toContainText("VWAP")
  // The spike stays beside the stock's levels until the price trades back to it.
  await expect(member.getByText(/on the open: 999\.50/)).toBeVisible()
  await expect(member.getByText("not reached again yet").first()).toBeVisible()
  await context.close()
})

test("HG posts the market brief and members read it in Alerts", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/briefs")
  const title = `Opening update ${String(Date.now())}`
  await page.getByLabel("Title", { exact: true }).fill(title)
  await page
    .getByLabel("The brief", { exact: true })
    .fill("The Dow opened higher.\n\nLevels to watch:\n- AAPL at the channel line\n- MSFT at the 30-day median")
  await page.getByRole("button", { name: "Post now" }).click()
  await expect(page.getByText("Brief posted")).toBeVisible()

  const context = await browser.newContext()
  const member = await context.newPage()
  await signIn(member, ACCOUNTS.active)
  await expect(member).toHaveURL(/\/members$/)
  // The newest brief leads the dashboard.
  await expect(member.getByText(title)).toBeVisible()
  await member.goto("/members/alerts/brief")
  await expect(member.getByText(title)).toBeVisible()
  await expect(member.getByRole("listitem").filter({ hasText: "AAPL at the channel line" })).toBeVisible()
  await expectNoHorizontalScroll(member)
  await context.close()
})

test("AI writes a brief draft from the team's instructions, for HG to check first", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto("/admin/briefs")
  await page.getByLabel("Instructions for the AI").fill("Start with the indexes, then the strike targets.")
  await page.getByRole("button", { name: "Try it now" }).click()
  await expect(page.getByText("The AI wrote a draft")).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/briefs\?edit=/)
  // Nobody else sees the draft until HG posts it.
  await expect(page.getByLabel("The brief", { exact: true })).toHaveValue(/Start with the indexes/)
  await expect(page.getByRole("listitem").filter({ hasText: "Draft · written by AI" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Post now" })).toBeVisible()
})
