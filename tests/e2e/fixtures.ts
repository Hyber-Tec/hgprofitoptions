import { test as base, expect, type Page } from "@playwright/test"

/** Demo accounts from scripts/seed-demo.ts. The password is generated for each run by scripts/e2e.ts. */
export const ACCOUNTS = {
  admin: "hg.demo@example.com",
  active: "ava.martin@example.com",
  expired: "diego.ramos@example.com",
  upcoming: "chloe.nguyen@example.com",
  suspended: "emma.wilson@example.com",
} as const

export function password(): string {
  const value = process.env.E2E_PASSWORD
  if (!value) throw new Error("E2E_PASSWORD is not set. Run the tests with `pnpm test:e2e`.")
  return value
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password())
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
}

/** Fails the test on any browser error, except the ones a test says it expects. */
export const test = base.extend<{ allowConsole: (pattern: RegExp) => void }>({
  allowConsole: [
    async ({ page }, use) => {
      const allowed: RegExp[] = []
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(`page error: ${error.message}`))
      page.on("console", (message) => {
        if (message.type() !== "error") return
        const text = message.text()
        if (!allowed.some((pattern) => pattern.test(text))) errors.push(`console: ${text}`)
      })
      await use((pattern) => allowed.push(pattern))
      expect(errors, "browser errors").toEqual([])
    },
    { auto: true },
  ],
})

/** No sideways scrolling: the page fits the viewport. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

export { expect }
