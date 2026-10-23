import type { Metadata } from "next"
import Link from "next/link"
import { LuPlus } from "react-icons/lu"
import { formatDateTimeET } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listQuizzes } from "@/lib/data/quizzes"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { ButtonLink } from "@/components/shared/button-link"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Quizzes" }

const STATUS = {
  draft: { label: "Draft", tone: "muted" },
  published: { label: "Published", tone: "positive" },
  archived: { label: "Archived", tone: "muted" },
} as const

export default async function AdminQuizzesPage() {
  await requireAdmin({ next: "/admin/quizzes" })
  const quizzes = await listQuizzes()
  return (
    <>
      <PageHeader
        title="Quizzes"
        description="Practice quizzes for every member, and tests you assign. AI writes the questions from a class document; you check them before publishing."
        actions={
          <ButtonLink size="sm" href="/admin/quizzes/new">
            <LuPlus />
            New quiz
          </ButtonLink>
        }
      />
      {quizzes.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No quizzes yet</EmptyTitle>
            <EmptyDescription>Start with New quiz and a class document.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Quiz</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Questions</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quizzes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link
                      href={`/admin/quizzes/${q.id}`}
                      className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {q.title}
                    </Link>
                    {q.source && <span className="block text-xs text-muted-foreground">From {q.source.name}</span>}
                  </TableCell>
                  <TableCell className="text-sm">{q.kind === "test" ? "Test" : "Practice"}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ToneBadge tone={STATUS[q.status].tone}>{STATUS[q.status].label}</ToneBadge>
                      {(q.generation?.status === "pending" || q.generation?.status === "running") && (
                        <ToneBadge tone="warning">AI writing</ToneBadge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{q.questions.length}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {formatDateTimeET(q.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
