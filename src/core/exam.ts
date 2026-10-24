/**
 * Reading an exam pasted from Google Forms, a document or an email into quiz questions, exactly as
 * written: nothing is reworded and no answer is guessed.
 */

export interface ExamQuestion {
  /** The line the question starts on (1-based), for messages. */
  line: number
  prompt: string
  choices: string[]
  /** The choice marked correct, or null when the text does not say. */
  answer: number | null
  explanation: string | null
}

export interface ExamIssue {
  line: number
  message: string
}

/** "1.", "1)", "Q1.", "Question 1:" before a question. */
const NUMBERED = /^(?:q(?:uestion)?\s*)?\d{1,3}\s*[.):-]\s+/i
/** "a)", "A.", "(a)", "-", "•", "○", or a checkbox ("[ ]", "[x]") before a choice. */
const CHOICE = /^(?:\(?([a-h])[.)]\s+|[-•○◯●]\s+|\[\s?([xX✓✔])?\s?\]\s*)/
/** A choice marked correct: "*" or "✓" before or after it, or "(correct)" after it. */
const MARKED = /^\*\s*|\s*\*$|^[✓✔]\s*|\s*[✓✔]$|\s*\((?:correct|right answer|answer)\)$/gi
const ANSWER = /^(?:the\s+)?(?:correct\s+|right\s+)?answer(?:\s+key)?\s*(?:[:\-–]|\s+is\b:?)\s*(.+)$/i
const EXPLANATION = /^(?:explanation|why|reason|feedback)\s*[:-]\s*(.+)$/i
/** Google Forms copies a required question's "*" on a line of its own, and each question's points. */
const FORM_NOISE = /^(?:\d+\s+points?|\*)$/i

const LETTERS = "abcdefgh"

type Draft = ExamQuestion & { letters: (string | null)[] }

/**
 * Reads pasted exam text. A question is a numbered line, a line ending in "?", or the first line after a
 * blank line once the question before has its choices; its choices follow, one per line. The correct
 * choice is marked with "*", "✓" or "(correct)", or named on an "Answer: B" line, and an "Explanation:"
 * line is kept. Questions whose answer is not marked come back with `answer` null, for the admin to pick.
 */
export function parseExam(text: string): { title: string | null; questions: ExamQuestion[]; issues: ExamIssue[] } {
  const questions: ExamQuestion[] = []
  const issues: ExamIssue[] = []
  let title: string | null = null
  let current: Draft | null = null
  let blankSinceChoice = false

  const finish = (draft: Draft | null) => {
    if (!draft) return
    // A line before the first question with no choices of its own is the exam's title.
    if (draft.choices.length === 0 && questions.length === 0 && title === null) title = draft.prompt
    else if (draft.choices.length < 2)
      issues.push({ line: draft.line, message: `"${shorten(draft.prompt)}" needs at least two choices.` })
    else
      questions.push({
        line: draft.line,
        prompt: draft.prompt,
        choices: draft.choices,
        answer: draft.answer,
        explanation: draft.explanation,
      })
  }

  const lines = text.split(/\r?\n/)
  for (const [index, raw] of lines.entries()) {
    const line = index + 1
    const clean = raw.replace(/ /g, " ").trim()
    if (clean === "") {
      if (current && current.choices.length > 0) blankSinceChoice = true
      continue
    }
    if (FORM_NOISE.test(clean)) continue

    const answer = current ? ANSWER.exec(clean) : null
    if (current && answer) {
      const found = answerIndex(current, (answer[1] ?? "").trim())
      if (found === -1)
        issues.push({ line, message: `"${(answer[1] ?? "").trim()}" is not one of the choices above it.` })
      else current.answer = found
      continue
    }
    const explanation = current ? EXPLANATION.exec(clean) : null
    if (current && explanation) {
      current.explanation = (explanation[1] ?? "").trim()
      continue
    }

    const choice = CHOICE.exec(clean)
    const startsQuestion =
      !current ||
      NUMBERED.test(clean) ||
      (!choice && current.choices.length >= 2 && (blankSinceChoice || /\?\s*\*?$/.test(clean)))
    if (startsQuestion) {
      finish(current)
      current = {
        line,
        prompt: clean
          .replace(NUMBERED, "")
          .replace(/\s*\*$/, "")
          .trim(),
        choices: [],
        answer: null,
        explanation: null,
        letters: [],
      }
      blankSinceChoice = false
      continue
    }
    if (!current) continue
    const body = choice ? clean.slice(choice[0].length) : clean
    const label = body.replace(MARKED, "").trim()
    if (label === "") continue
    if (choice?.[2] !== undefined || label !== body.trim()) current.answer = current.choices.length
    current.letters.push(choice?.[1]?.toLowerCase() ?? null)
    current.choices.push(label)
    blankSinceChoice = false
  }
  finish(current)
  return { title, questions, issues }
}

/** The choice an "Answer:" line names: by its letter as written, by its text, or by its place (A is the first). */
function answerIndex(question: Draft, given: string): number {
  const value = given.replace(/^\(?([a-h])[.)]?$/i, "$1").replace(/[.]$/, "")
  if (value.length === 1) {
    const written = question.letters.indexOf(value.toLowerCase())
    if (written !== -1) return written
    const place = LETTERS.indexOf(value.toLowerCase())
    if (place !== -1 && place < question.choices.length) return place
  }
  return question.choices.findIndex((c) => c.toLowerCase() === value.toLowerCase())
}

const shorten = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}...` : text)
