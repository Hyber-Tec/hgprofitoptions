import type { Metadata } from "next"
import Link from "next/link"
import { LuClipboardCheck, LuGraduationCap } from "react-icons/lu"
import { formatDate, formatPercent, plural } from "@/core/format"
import { LEVEL_LABELS } from "@/core/levels"
import { requireActiveMember } from "@/lib/auth/guards"
import { getQuiz, listMyAttempts, listOpenAssignments, listPracticeQuizzes } from "@/lib/data/quizzes"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { StartPracticeButton, StartTestButton } from "@/components/portal/quizzes/start-buttons"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { isoDateInZone } from "@/core/dates"

export const metadata: Metadata = { title: "Quizzes" }

const percent = (score: number | null) => formatPercent(score, { digits: 0, signed: false })

export default async function QuizzesPage() {
  const viewer = await requireActiveMember("/members/quizzes")
  const [practice, assignments, attempts] = await Promise.all([
    listPracticeQuizzes(),
    listOpenAssignments(viewer.uid),
    listMyAttempts(viewer.uid),
  ])
  const tests = (await Promise.all(assignments.map(async (a) => ({ a, quiz: await getQuiz(a.quizId) })))).filter(
    (t) => t.quiz !== null && t.quiz.status === "published",
  )
  const best = new Map<string, number>()
  for (const attempt of attempts)
    if (attempt.kind === "practice" && attempt.score !== null)
      best.set(attempt.quizId, Math.max(best.get(attempt.quizId) ?? 0, attempt.score))

  return (
    <>
      <PageHeader
        title="Quizzes"
        description="Practice what the class covered. When you are ready to move up, HG's team gives you a test."
      />

      {tests.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="tests">
          <h2 id="tests" className="text-base font-semibold">
            Your tests
          </h2>
          {tests.map(({ a, quiz }) =>
            quiz ? (
              <Card key={a.id} className="border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LuClipboardCheck className="size-4" aria-hidden="true" />
                    {quiz.title}
                  </CardTitle>
                  <CardDescription>
                    {plural(Math.min(quiz.perAttempt, quiz.questions.length), "question")} · pass with{" "}
                    {percent(quiz.passScore)}
                    {quiz.awardsLevel ? ` to become an ${LEVEL_LABELS[quiz.awardsLevel]} trader` : ""} · assigned{" "}
                    {formatDate(isoDateInZone(a.assignedAt))}
                  </CardDescription>
                  <CardAction>
                    <StartTestButton
                      assignmentId={a.id}
                      title={quiz.title}
                      questions={Math.min(quiz.perAttempt, quiz.questions.length)}
                      passPercent={Math.round(quiz.passScore * 100)}
                      started={a.status === "started"}
                    />
                  </CardAction>
                </CardHeader>
              </Card>
            ) : null,
          )}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="practice">
        <h2 id="practice" className="text-base font-semibold">
          Practice
        </h2>
        {practice.length === 0 ? (
          <Empty className="border border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LuGraduationCap />
              </EmptyMedia>
              <EmptyTitle>No practice quizzes yet</EmptyTitle>
              <EmptyDescription>HG&apos;s team adds them from the class documents.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {practice.map((quiz) => {
              const top = best.get(quiz.id)
              return (
                <Card key={quiz.id} size="sm">
                  <CardHeader>
                    <CardTitle>{quiz.title}</CardTitle>
                    <CardDescription>
                      {quiz.description ? `${quiz.description} · ` : ""}
                      {plural(Math.min(quiz.perAttempt, quiz.questions.length), "question")} a round
                      {top !== undefined ? ` · your best ${percent(top)}` : ""}
                    </CardDescription>
                    <CardAction>
                      <StartPracticeButton quizId={quiz.id} />
                    </CardAction>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {attempts.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="results">
          <h2 id="results" className="text-base font-semibold">
            Your results
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link
                  href={`/members/quizzes/attempts/${attempt.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{attempt.quizTitle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {attempt.kind === "test" ? "Test" : "Practice"} ·{" "}
                      {attempt.submittedAt ? formatDate(isoDateInZone(attempt.submittedAt)) : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    {attempt.kind === "test" && (
                      <ToneBadge tone={attempt.passed ? "positive" : "muted"}>
                        {attempt.passed ? "Passed" : "Not passed"}
                      </ToneBadge>
                    )}
                    <span className="font-semibold">{percent(attempt.score)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
