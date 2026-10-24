import { ACCOUNTS, expect, signIn, test } from "./fixtures"

test("members download the Median & Channel Chart and Strike Price Targets with today's prices", async ({ page }) => {
  await signIn(page, ACCOUNTS.active)
  await expect(page).toHaveURL(/\/members$/)
  await page.goto("/members/channels")
  await expect(page.getByRole("link", { name: "Print" })).toHaveAttribute("href", "/members/channels/pdf?print=1")
  const channels = await page.request.get("/members/channels/pdf")
  expect(channels.status()).toBe(200)
  expect(channels.headers()["content-type"]).toBe("application/pdf")
  expect(channels.headers()["content-disposition"]).toMatch(/^attachment; filename="median-channel-chart-/)

  await page.goto("/members/targets")
  const pdf = page.getByRole("link", { name: "PDF" })
  const targets = await page.request.get((await pdf.getAttribute("href")) ?? "")
  expect(targets.status()).toBe(200)
  expect(targets.headers()["content-type"]).toBe("application/pdf")
})
