import type { Page } from "@playwright/test"
import { ACCOUNTS, expect, signIn, test } from "./fixtures"

/** Admin > Settings > Billing, with stand-in details. */
async function fillBilling(page: Page) {
  await page.goto("/admin/settings")
  const field = (label: string) => page.getByLabel(label, { exact: true })
  await field("Address").fill("100 Example Road\nFront Royal VA 22630")
  await field("Price of a quarter (USD)").fill("1895")
  await field("Cash App").fill("$ExampleTag")
  await field("Bank").fill("Example Federal Credit Union")
  await field("Beneficiary").fill("Hubert Gaffney")
  await field("Account number").fill("0000000000")
  await page.getByRole("button", { name: "Save billing details" }).click()
  await expect(page.getByText("Billing details saved")).toBeVisible()
}

async function openSubscription(page: Page, name: string) {
  await page.goto("/admin/members")
  await page.getByRole("link", { name }).first().click()
  await expect(page).toHaveURL(/\/admin\/members\/[^/?]+$/)
  await page.getByRole("link", { name: "Subscription" }).click()
  await expect(page).toHaveURL(/tab=subscription/)
}

test("HG issues an invoice to a member, who downloads it and sees it paid", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await fillBilling(page)
  await openSubscription(page, "Ava Martin")
  await page.getByRole("link", { name: "New invoice" }).click()
  await expect(page).toHaveURL(/\/invoice$/)

  // Prefilled from Ava's membership at the price of a quarter; the preview follows the form.
  const preview = page.getByRole("article", { name: "Invoice preview" })
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Ava Martin")
  await expect(preview).toContainText("Billed to")
  await expect(preview).toContainText("$ExampleTag")
  await page.getByLabel("Mailing address").fill("12 Sample Street\nAtlanta GA 30303")
  await expect(preview).toContainText("12 Sample Street")

  // Only what the PDF can print.
  await page.getByLabel("Name", { exact: true }).fill("에이바 Martin")
  await page.getByRole("button", { name: "Issue invoice" }).click()
  await expect(page.getByText(/Invoices print Latin letters only/)).toBeVisible()
  await page.getByLabel("Name", { exact: true }).fill("Ava Martin")

  await page.getByRole("button", { name: "Issue invoice" }).click()
  await expect(page).toHaveURL(/tab=subscription/)
  const row = page.getByRole("row").filter({ hasText: "Unpaid" }).first()
  const link = row.getByRole("link", { name: /^HG-\d{4}-\d{3}$/ })
  const number = (await link.textContent()) ?? ""
  const href = (await link.getAttribute("href")) ?? ""
  const pdf = await page.request.get(href)
  expect(pdf.headers()["content-type"]).toBe("application/pdf")
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-")

  const member = await browser.newContext()
  const ava = await member.newPage()
  await signIn(ava, ACCOUNTS.active)
  await expect(ava).toHaveURL(/\/members$/)
  await ava.goto("/members/settings")
  const invoices = ava.locator("#invoices")
  await expect(invoices.getByText(number)).toBeVisible()
  await expect(invoices.getByText("Unpaid")).toBeVisible()
  expect((await ava.request.get(href)).status()).toBe(200)
  // The address she was billed at is kept for next time.
  await expect(ava.getByLabel("Mailing address")).toHaveValue("12 Sample Street\nAtlanta GA 30303")

  const other = await browser.newContext()
  const ben = await other.newPage()
  await signIn(ben, "ben.carter@example.com")
  await expect(ben).toHaveURL(/\/members$/)
  expect((await ben.request.get(href)).status()).toBe(404)
  await other.close()

  await page.getByRole("button", { name: `Change ${number}` }).click()
  await page.getByRole("menuitem", { name: "Mark as paid today" }).click()
  await expect(page.getByText(`${number} marked as paid`)).toBeVisible()
  await ava.reload()
  await expect(invoices.getByText("Paid", { exact: true })).toBeVisible()

  // A cancelled invoice is gone for the member, and its number is not used again.
  await page.getByRole("button", { name: `Change ${number}` }).click()
  await page.getByRole("menuitem", { name: "Cancel invoice" }).click()
  await page.getByRole("button", { name: "Cancel invoice" }).click()
  await expect(page.getByText(`${number} cancelled`)).toBeVisible()
  await ava.reload()
  await expect(ava.getByText(number)).toHaveCount(0)
  expect((await ava.request.get(href)).status()).toBe(404)
  await member.close()
})
