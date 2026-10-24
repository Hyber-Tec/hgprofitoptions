import { describe, expect, it } from "vitest"
import { parseExam } from "./exam"

describe("reading a pasted exam", () => {
  it("reads a Google Form's questions and an answer named after them", () => {
    const { title, questions, issues } = parseExam(
      [
        "Channels and BOC exam",
        "1. What does BOC stand for? *",
        "1 point",
        "Break of channel",
        "Bottom of candle",
        "Base of chart",
        "Answer: Break of channel",
        "",
        "2. When do you act on a break of the channel line?",
        "a) On the first touch",
        "b) After the close below it",
        "c) At the open",
        "Answer: B",
        "Explanation: HG waits for the close.",
      ].join("\n"),
    )
    expect(issues).toEqual([])
    expect(title).toBe("Channels and BOC exam")
    expect(questions).toEqual([
      {
        line: 2,
        prompt: "What does BOC stand for?",
        choices: ["Break of channel", "Bottom of candle", "Base of chart"],
        answer: 0,
        explanation: null,
      },
      {
        line: 9,
        prompt: "When do you act on a break of the channel line?",
        choices: ["On the first touch", "After the close below it", "At the open"],
        answer: 1,
        explanation: "HG waits for the close.",
      },
    ])
  })

  it("takes the marked choice, and splits unnumbered questions at blank lines", () => {
    const { questions } = parseExam(
      [
        "What is a spike?",
        "A sudden candle from big orders ✓",
        "A dividend",
        "",
        "Pick the median HG reads first",
        "- 5-day",
        "- 30-day (correct)",
        "- 90-day",
        "",
        "Which is a checkbox answer?",
        "[ ] This one",
        "[x] That one",
        "",
        "Which is starred?",
        "*Starred",
        "Plain",
      ].join("\n"),
    )
    expect(questions.map((q) => [q.prompt, q.choices, q.answer])).toEqual([
      ["What is a spike?", ["A sudden candle from big orders", "A dividend"], 0],
      ["Pick the median HG reads first", ["5-day", "30-day", "90-day"], 1],
      ["Which is a checkbox answer?", ["This one", "That one"], 1],
      ["Which is starred?", ["Starred", "Plain"], 0],
    ])
  })

  it("leaves an unmarked answer for the admin and says what is missing", () => {
    const { questions, issues } = parseExam(
      [
        "1. Unmarked?",
        "Yes",
        "No",
        "2. Only one choice?",
        "Maybe",
        "3. Wrong key?",
        "Up",
        "Down",
        "Answer: Sideways",
      ].join("\n"),
    )
    expect(questions.map((q) => [q.prompt, q.answer])).toEqual([
      ["Unmarked?", null],
      ["Wrong key?", null],
    ])
    expect(issues).toEqual([
      { line: 4, message: '"Only one choice?" needs at least two choices.' },
      { line: 9, message: '"Sideways" is not one of the choices above it.' },
    ])
  })
})
