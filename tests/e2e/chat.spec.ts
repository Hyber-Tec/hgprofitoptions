import { ACCOUNTS, expect, signIn, test } from "./fixtures"

test("a member asks a question and sees HG's answer arrive", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.active)
  await expect(page).toHaveURL(/\/members$/)
  await page.goto("/members/chat")
  await page.getByRole("button", { name: "Ask a question" }).click()
  const question = `Do we wait for the close below the break? (${Date.now()})`
  await page.getByLabel("Your question").fill(question)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page).toHaveURL(/\/members\/chat\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 2, name: question })).toBeVisible()
  await expect(page.getByText("Waiting for an answer")).toBeVisible()

  const hg = await browser.newContext()
  const admin = await hg.newPage()
  await signIn(admin, ACCOUNTS.admin)
  await expect(admin).toHaveURL(/\/admin$/)
  await admin.goto("/members/chat")
  // Advanced traders and admins start on the questions waiting for an answer.
  await admin.getByRole("link", { name: new RegExp(question.replace(/[()?]/g, "\\$&")) }).click()
  await admin.getByLabel("Your answer").fill("Yes. A wick through the level is not a break; wait for the close.")
  await admin.getByRole("button", { name: "Send" }).click()
  await expect(
    admin.getByRole("list", { name: "Messages" }).getByText("A wick through the level is not a break"),
  ).toBeVisible()
  await hg.close()

  // The member's open page shows the answer without a reload.
  await expect(
    page.getByRole("list", { name: "Messages" }).getByText("A wick through the level is not a break"),
  ).toBeVisible()
  await expect(page.getByText("Answered", { exact: true }).first()).toBeVisible()
})

test("members read class questions but only the asker, advanced traders and admins reply", async ({
  page,
  browser,
}) => {
  const askerContext = await browser.newContext()
  const asker = await askerContext.newPage()
  await signIn(asker, ACCOUNTS.active)
  await expect(asker).toHaveURL(/\/members$/)
  await asker.goto("/members/chat")
  await asker.getByRole("button", { name: "Ask a question" }).click()
  const question = `Is BOC always half the channel? (${Date.now()})`
  await asker.getByLabel("Your question").fill(question)
  await asker.getByRole("button", { name: "Send", exact: true }).click()
  await expect(asker).toHaveURL(/\/members\/chat\/[^/]+$/)
  const url = asker.url()
  await askerContext.close()

  await signIn(page, "ben.carter@example.com")
  await expect(page).toHaveURL(/\/members$/)
  await page.goto(url)
  await expect(page.getByRole("heading", { level: 2, name: question })).toBeVisible()
  await expect(page.getByLabel("Your answer")).toHaveCount(0)
  await expect(page.getByText("The person who asked, advanced traders and admins reply here.")).toBeVisible()
})
