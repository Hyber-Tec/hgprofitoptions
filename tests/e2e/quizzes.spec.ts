import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { ACCOUNTS, expect, signIn, test } from "./fixtures"

const NOTES = "tests/e2e/files/class-notes.txt"
const notes = readFileSync(NOTES, "utf8").replace(/\s+/g, " ")

/** Creates a quiz from the class notes; the stand-in AI writes `count` questions from them. */
async function createQuiz(page: Page, title: string, kind: "Practice" | "Test", count: number) {
  await page.goto("/admin/quizzes/new")
  await page.getByLabel("Title").fill(title)
  await page.getByRole("button", { name: kind, exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(NOTES)
  await expect(page.getByText("class-notes.txt")).toBeVisible()
  await page.getByRole("combobox", { name: "Questions for the AI to write" }).click()
  await page.getByRole("option", { name: `${count} questions`, exact: true }).click()
  await page.getByRole("button", { name: "Create and write questions" }).click()
  await expect(page).toHaveURL(/\/admin\/quizzes\/(?!new)[^/]+$/)
  await expect(page.getByText(`Question ${count}:`)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Publish" }).click()
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible()
}

/** The stand-in AI's correct answer is the sentence from the notes; the wrong ones are altered copies. */
async function answerCorrectly(page: Page) {
  const choices = page.getByRole("group", { name: "Answers" }).getByRole("button")
  await expect(choices).toHaveCount(4)
  const texts = (await choices.allTextContents()).map((t) =>
    t
      .replace(/^[A-F]/, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
  const index = texts.findIndex((text) => notes.includes(text))
  if (index === -1) throw new Error(`No choice matches the notes: ${JSON.stringify(texts)}`)
  await choices.nth(index).click()
}

test("HG makes a practice quiz from class notes and members practice with instant feedback", async ({
  page,
  browser,
}) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await createQuiz(page, "Channel basics", "Practice", 5)

  const member = await browser.newContext()
  const ava = await member.newPage()
  await signIn(ava, ACCOUNTS.active)
  await expect(ava).toHaveURL(/\/members$/)
  await ava.goto("/members/quizzes")
  await ava
    .locator("[data-slot=card]")
    .filter({ hasText: "Channel basics" })
    .getByRole("button", { name: "Practice" })
    .click()
  await expect(ava).toHaveURL(/\/members\/quizzes\/attempts\/[^/]+$/)
  await answerCorrectly(ava)
  await expect(ava.getByRole("status").filter({ hasText: "Correct" })).toBeVisible()
  await member.close()
})

test("passing the exam with 80% or more makes a beginner Intermediate", async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/admin$/)
  await createQuiz(page, "Intermediate exam", "Test", 5)
  await page.getByLabel("Find a member").fill("Ben")
  await page.getByRole("checkbox").first().click()
  await page.getByRole("button", { name: "Assign to 1 member" }).click()
  await expect(page.getByText("Assigned to 1 member")).toBeVisible()

  const member = await browser.newContext()
  const ben = await member.newPage()
  await signIn(ben, "ben.carter@example.com")
  await expect(ben).toHaveURL(/\/members$/)
  await ben.goto("/members/quizzes")
  await ben.getByRole("button", { name: "Start test" }).click()
  await ben.getByRole("button", { name: "Start", exact: true }).click()
  await expect(ben).toHaveURL(/\/members\/quizzes\/attempts\/[^/]+$/)
  for (let i = 1; i <= 5; i++) {
    await expect(ben.getByText(`Question ${i} of 5`)).toBeVisible()
    await answerCorrectly(ben)
    await ben.getByRole("button", { name: i === 5 ? "Submit test" : "Next", exact: true }).click()
  }
  await expect(ben.getByText("You are now an Intermediate trader.")).toBeVisible()
  await expect(ben.getByText("100%")).toBeVisible()
  // The level guide marks the new level and says what comes next.
  await ben.goto("/members/settings")
  const levels = ben.locator("#levels")
  await expect(levels.getByText("Intermediate", { exact: true }).first()).toBeVisible()
  await expect(levels.locator('[aria-current="step"]')).toContainText("Intermediate")
  await expect(levels.getByText("HG moves traders up to Advanced when they are ready.")).toBeVisible()
  await member.close()
})
