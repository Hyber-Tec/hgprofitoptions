/** Practice quizzes and tests: drawing questions for an attempt and grading it. */

/** `count` question ids drawn at random from the bank, each at most once. */
export function drawQuestions(
  bank: readonly { id: string }[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const ids = bank.map((q) => q.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j] as string, ids[i] as string]
  }
  return ids.slice(0, Math.max(0, Math.min(count, ids.length)))
}

export interface Grade {
  correct: number
  total: number
  /** correct / total, 0 for an empty attempt. */
  score: number
}

/** Grades the answers given to the drawn questions. A question no longer in the bank counts as wrong. */
export function gradeAttempt(
  bank: readonly { id: string; answer: number }[],
  questionIds: readonly string[],
  answers: readonly (number | null)[],
): Grade {
  const byId = new Map(bank.map((q) => [q.id, q]))
  let correct = 0
  questionIds.forEach((id, i) => {
    const question = byId.get(id)
    if (question && answers[i] === question.answer) correct++
  })
  const total = questionIds.length
  return { correct, total, score: total === 0 ? 0 : correct / total }
}

/** Compared to a tenth of a percent, so floating-point noise never fails a pass (8/10 passes an 80% mark). */
export function passes(score: number, passScore: number): boolean {
  return Math.round(score * 1000) >= Math.round(passScore * 1000)
}
