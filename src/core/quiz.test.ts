import { describe, expect, it } from "vitest"
import { drawQuestions, gradeAttempt, passes } from "./quiz"

const bank = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, answer: i % 4 }))

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe("drawing questions", () => {
  it("draws the asked number of different questions", () => {
    const ids = drawQuestions(bank, 3, seeded(7))
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(bank.map((q) => q.id)).toContain(id)
  })

  it("draws the whole bank when asked for more than it has", () => {
    expect(drawQuestions(bank, 50, seeded(3)).sort()).toEqual(["a", "b", "c", "d", "e"])
    expect(drawQuestions([], 10)).toEqual([])
  })
})

describe("grading", () => {
  it("counts the right answers", () => {
    expect(gradeAttempt(bank, ["a", "b", "c"], [0, 1, 0])).toEqual({ correct: 2, total: 3, score: 2 / 3 })
  })

  it("counts unanswered and removed questions as wrong", () => {
    expect(gradeAttempt(bank, ["a", "gone"], [null, 0])).toEqual({ correct: 0, total: 2, score: 0 })
    expect(gradeAttempt(bank, [], [])).toEqual({ correct: 0, total: 0, score: 0 })
  })

  it("passes at the mark, in whole percents", () => {
    expect(passes(0.8, 0.8)).toBe(true)
    expect(passes(8 / 10, 0.8)).toBe(true)
    expect(passes(0.7999, 0.8)).toBe(true)
    expect(passes(0.79, 0.8)).toBe(false)
  })
})
