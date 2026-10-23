import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isoDateInZone } from "@/core/dates"
import { formatDate, formatPercent, plural } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listMembers } from "@/lib/data/admin"
import { getQuiz, listAssignmentsFor, listAttemptsFor } from "@/lib/data/quizzes"
import { integrations } from "@/lib/env.server"
import { AssignTestForm, CancelAssignmentButton } from "@/components/admin/quiz-assign"
import { GenerationStatus, QuizSettingsForm, QuizStatusButtons } from "@/components/admin/quiz-forms"
import { QuestionsEditor } from "@/components/admin/quiz-questions"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Quiz" }

const percent = (score: number | null) => formatPercent(score, { digits: 0, signed: false })
const STATUS = { assigned: "Not started", started: "In progress", completed: "Done", cancelled: "Cancelled" } as const

export default async function AdminQuizPage({ params }: PageProps<"/admin/quizzes/[id]">) {
  const { id } = await params
  await requireAdmin({ next: `/admin/quizzes/${id}` })
  const quiz = await getQuiz(id)
  if (!quiz) notFound()
  const [assignments, attempts, members] = await Promise.all([
    quiz.kind === "test" ? listAssignmentsFor(quiz.id) : Promise.resolve([]),
    listAttemptsFor(quiz.id),
    quiz.kind === "test" ? listMembers() : Promise.resolve([]),
  ])
  const working = quiz.generation?.status === "pending" || quiz.generation?.status === "running"
  const waiting = new Set(
    assignments.filter((a) => a.status === "assigned" || a.status === "started").map((a) => a.uid),
  )
  const assignable = members
    .filter((m) => m.role === "member" && m.status === "active")
    .map((m) => ({ uid: m.uid, fullName: m.fullName, email: m.email, level: m.level, waiting: waiting.has(m.uid) }))

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={quiz.source ? `From ${quiz.source.name}` : "Questions written by hand"}
        meta={
          <>
            <ToneBadge tone="neutral">{quiz.kind === "test" ? "Test" : "Practice"}</ToneBadge>
            <ToneBadge tone={quiz.status === "published" ? "positive" : "muted"}>
              {quiz.status === "published" ? "Published" : quiz.status === "archived" ? "Archived" : "Draft"}
            </ToneBadge>
            <span>{plural(quiz.questions.length, "question")}</span>
          </>
        }
        actions={<QuizStatusButtons quizId={quiz.id} status={quiz.status} questions={quiz.questions.length} />}
      />
      {quiz.generation && (
        <GenerationStatus
          quizId={quiz.id}
          status={quiz.generation.status}
          message={quiz.generation.message}
          canRetry={integrations.ai && quiz.source?.path != null}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <CardDescription>
              {quiz.kind === "test"
                ? "Each test draws its questions at random from these."
                : "Each practice round draws its questions at random from these."}{" "}
              Check what the AI wrote before you publish.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionsEditor
              quizId={quiz.id}
              questions={quiz.questions}
              canWriteMore={integrations.ai && quiz.source?.path != null && !working}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <QuizSettingsForm
                quizId={quiz.id}
                kind={quiz.kind}
                initial={{
                  title: quiz.title,
                  description: quiz.description,
                  perAttempt: quiz.perAttempt,
                  passScore: quiz.passScore,
                  awardsLevel: quiz.awardsLevel,
                }}
              />
            </CardContent>
          </Card>
          {quiz.kind === "test" && (
            <Card>
              <CardHeader>
                <CardTitle>Assign the test</CardTitle>
                <CardDescription>
                  {quiz.status === "published"
                    ? "Members you pick see it under Quizzes and take it once."
                    : "Publish the test to assign it."}
                </CardDescription>
              </CardHeader>
              {quiz.status === "published" && (
                <CardContent>
                  <AssignTestForm quizId={quiz.id} members={assignable} />
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>

      {quiz.kind === "test" && assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Member</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="w-12 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-6 font-medium">{a.memberName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(isoDateInZone(a.assignedAt))}
                    </TableCell>
                    <TableCell>
                      {a.status === "completed" ? (
                        <ToneBadge tone={a.passed ? "positive" : "negative"}>
                          {a.passed ? "Passed" : "Not passed"}
                        </ToneBadge>
                      ) : (
                        <ToneBadge tone="muted">{STATUS[a.status]}</ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.score === null ? "-" : percent(a.score)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {(a.status === "assigned" || a.status === "started") && (
                        <CancelAssignmentButton assignmentId={a.id} name={a.memberName} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {quiz.kind === "practice" && attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Practice results</CardTitle>
            <CardDescription>The latest finished rounds.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Member</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="pr-6 text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-6 font-medium">{a.memberName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.submittedAt ? formatDate(isoDateInZone(a.submittedAt)) : "-"}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">{percent(a.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
