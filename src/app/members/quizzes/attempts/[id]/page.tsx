import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireActiveMember } from "@/lib/auth/guards"
import { getAttempt, getQuiz } from "@/lib/data/quizzes"
import { QuizRunner, type RunnerQuestion } from "@/components/portal/quizzes/quiz-runner"

export const metadata: Metadata = { title: "Quiz" }

export default async function AttemptPage({ params }: PageProps<"/members/quizzes/attempts/[id]">) {
  const { id } = await params
  const viewer = await requireActiveMember(`/members/quizzes/attempts/${id}`)
  const attempt = await getAttempt(id)
  if (!attempt || attempt.uid !== viewer.uid) notFound()
  const quiz = await getQuiz(attempt.quizId)
  if (!quiz) notFound()
  const byId = new Map(quiz.questions.map((q) => [q.id, q]))
  const submitted = attempt.submittedAt !== null
  // Practice shows the right answer once the member has answered; a test never sends the answers.
  const questions: RunnerQuestion[] = attempt.questionIds.map((questionId, i) => {
    const q = byId.get(questionId)
    const given = attempt.answers[i] ?? null
    const reveal = attempt.kind === "practice" && (given !== null || submitted) && q !== undefined
    return {
      prompt: q?.prompt ?? "This question was removed from the quiz.",
      choices: q?.choices ?? [],
      given,
      answer: reveal ? q.answer : null,
      explanation: reveal ? q.explanation : null,
    }
  })
  return (
    <QuizRunner
      attemptId={attempt.id}
      quizId={quiz.id}
      title={quiz.title}
      kind={attempt.kind}
      questions={questions}
      submitted={submitted}
      result={
        submitted
          ? {
              correct: attempt.correct,
              total: attempt.questionIds.length,
              score: attempt.score ?? 0,
              passed: attempt.passed,
              passScore: quiz.passScore,
            }
          : null
      }
    />
  )
}
