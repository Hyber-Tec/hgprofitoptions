import { describe, expect, it } from "vitest"
import { isUnread, messagePreview, threadTitle, type ChatThread } from "./chat"
import { answersQuestions, levelAfterPass, personBadge } from "./levels"

const thread = (overrides: Partial<ChatThread> = {}): ChatThread => ({
  id: "t1",
  askerUid: "ava",
  askerName: "Ava Martin",
  visibility: "class",
  title: "When does a break count?",
  status: "open",
  createdAt: 1_000,
  lastMessageAt: 5_000,
  lastMessageBy: "hg",
  lastMessagePreview: "Wait for the close.",
  messageCount: 2,
  ...overrides,
})

describe("chat threads", () => {
  it("titles a question with its first line", () => {
    expect(threadTitle("\n  When does TSM count as broken?\nIt wicked through 465 today.")).toBe(
      "When does TSM count as broken?",
    )
    expect(threadTitle("x".repeat(200))).toHaveLength(120)
    expect(threadTitle("x".repeat(200)).endsWith("...")).toBe(true)
  })

  it("previews a message on one line", () => {
    expect(messagePreview("Wait for the close.\n\nThen take the put.")).toBe("Wait for the close. Then take the put.")
    expect(messagePreview("y".repeat(300))).toHaveLength(140)
  })

  it("counts a thread unread when someone else wrote after the member last looked", () => {
    expect(isUnread(thread(), "ava", { t1: 4_000 })).toBe(true)
    expect(isUnread(thread(), "ava", { t1: 5_000 })).toBe(false)
    expect(isUnread(thread(), "ava", {})).toBe(true)
    expect(isUnread(thread({ lastMessageBy: "ava" }), "ava", {})).toBe(false)
  })
})

describe("trader levels", () => {
  it("lets advanced traders and admins answer questions", () => {
    expect(answersQuestions({ role: "member", level: "advanced" })).toBe(true)
    expect(answersQuestions({ role: "admin", level: "beginner" })).toBe(true)
    expect(answersQuestions({ role: "member", level: "intermediate" })).toBe(false)
    expect(answersQuestions({ role: "editor", level: "beginner" })).toBe(false)
  })

  it("only ever raises a level after a passed test", () => {
    expect(levelAfterPass("beginner", "intermediate")).toBe("intermediate")
    expect(levelAfterPass("advanced", "intermediate")).toBe("advanced")
    expect(levelAfterPass("intermediate", "intermediate")).toBe("intermediate")
  })

  it("labels people by role, then level", () => {
    expect(personBadge({ role: "admin", level: "beginner" })).toBe("Admin")
    expect(personBadge({ role: "editor", level: "beginner" })).toBe("Data editor")
    expect(personBadge({ role: "member", level: "intermediate" })).toBe("Intermediate")
  })
})
