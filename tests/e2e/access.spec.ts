import { ACCOUNTS, expect, signIn, test } from "./fixtures"

test("an expired member keeps their account but not the tools", async ({ page }) => {
  await signIn(page, ACCOUNTS.expired)
  await expect(page).toHaveURL(/\/members\/inactive$/)
  await expect(page.getByRole("heading", { level: 1, name: "Membership" })).toBeVisible()
  await page.goto("/members/targets")
  await expect(page).toHaveURL(/\/members\/inactive$/)
  // Their own journal stays readable.
  await page.goto("/members/journal")
  await expect(page.getByRole("heading", { level: 1, name: "Journal" })).toBeVisible()
})

test("a member whose quarter has not started waits on the membership page", async ({ page }) => {
  await signIn(page, ACCOUNTS.upcoming)
  await expect(page).toHaveURL(/\/members\/inactive$/)
})

test("a suspended member cannot sign in", async ({ page, allowConsole }) => {
  allowConsole(/status of 400/)
  await signIn(page, ACCOUNTS.suspended)
  await expect(page.getByText("This account has been disabled. Please contact HG.")).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
