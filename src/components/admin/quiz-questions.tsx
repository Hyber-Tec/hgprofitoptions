"use client"

import { useState, useTransition } from "react"
import { LuCheck, LuPencil, LuPlus, LuSparkles, LuTrash2 } from "react-icons/lu"
import { deleteQuestion, saveQuestion, writeMoreQuestions } from "@/lib/actions/admin/quizzes"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

export interface EditableQuestion {
  id: string
  prompt: string
  choices: string[]
  answer: number
  explanation: string
}

const LETTERS = ["A", "B", "C", "D", "E", "F"]
const blank = (): EditableQuestion => ({ id: "", prompt: "", choices: ["", "", "", ""], answer: 0, explanation: "" })
const MORE = [5, 10, 15, 20].map((n) => ({ value: String(n), label: `${n} more` }))

function QuestionDialog({
  quizId,
  question,
  onClose,
}: {
  quizId: string
  question: EditableQuestion | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState<EditableQuestion>(question ?? blank())
  const [pending, startTransition] = useTransition()
  const save = () =>
    startTransition(async () => {
      const result = await saveQuestion(quizId, {
        id: draft.id || null,
        prompt: draft.prompt,
        choices: draft.choices,
        answer: draft.answer,
        explanation: draft.explanation,
      })
      if (!result.ok) {
        toast.add({ title: "Not saved", description: result.message, type: "error" })
        return
      }
      toast.add({ title: "Question saved", type: "success" })
      onClose()
    })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit question" : "Add a question"}</DialogTitle>
          <DialogDescription>Mark the correct choice with the circle next to it.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="qq-prompt">Question</FieldLabel>
              <Textarea
                id="qq-prompt"
                rows={2}
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Choices</legend>
              {draft.choices.map((choice, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, answer: i })}
                    aria-pressed={draft.answer === i}
                    aria-label={`Choice ${LETTERS[i] ?? i + 1} is correct`}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      draft.answer === i ? "border-positive bg-positive text-background" : "text-muted-foreground",
                    )}
                  >
                    {draft.answer === i ? <LuCheck className="size-3.5" /> : LETTERS[i]}
                  </button>
                  <Input
                    value={choice}
                    onChange={(e) =>
                      setDraft({ ...draft, choices: draft.choices.map((c, j) => (j === i ? e.target.value : c)) })
                    }
                    aria-label={`Choice ${LETTERS[i] ?? i + 1}`}
                  />
                </div>
              ))}
            </fieldset>
            <Field>
              <FieldLabel htmlFor="qq-explanation">Explanation</FieldLabel>
              <Textarea
                id="qq-explanation"
                rows={2}
                value={draft.explanation}
                onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
              />
              <FieldDescription>Shown after a practice answer, so members learn why.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Save question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The question bank: read through what the AI wrote, fix or remove anything off, add your own. */
export function QuestionsEditor({
  quizId,
  questions,
  canWriteMore,
}: {
  quizId: string
  questions: EditableQuestion[]
  /** The quiz has a document, AI is set up and it is not already working. */
  canWriteMore: boolean
}) {
  const [editing, setEditing] = useState<EditableQuestion | "new" | null>(null)
  const [more, setMore] = useState("10")
  const [pending, startTransition] = useTransition()

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteQuestion(quizId, id)
      if (!result.ok) toast.add({ title: "Not deleted", description: result.message, type: "error" })
    })
  const writeMore = () =>
    startTransition(async () => {
      const result = await writeMoreQuestions(quizId, Number(more))
      if (!result.ok) toast.add({ title: "Not started", description: result.message, type: "error" })
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <LuPlus />
          Add a question
        </Button>
        {canWriteMore && (
          <>
            <Select items={MORE} value={more} onValueChange={(v: string | null) => setMore(v ?? "10")}>
              <SelectTrigger size="sm" className="w-28" aria-label="How many more">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MORE.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={writeMore} disabled={pending}>
              {pending ? <Spinner /> : <LuSparkles />}
              Write with AI
            </Button>
          </>
        )}
      </div>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No questions yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {questions.map((q, n) => (
            <li key={q.id} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="mr-2 text-muted-foreground tabular-nums">{n + 1}.</span>
                  {q.prompt}
                </p>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit question ${n + 1}`}
                    onClick={() => setEditing(q)}
                  >
                    <LuPencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete question ${n + 1}`}
                    onClick={() => remove(q.id)}
                    disabled={pending}
                  >
                    <LuTrash2 />
                  </Button>
                </div>
              </div>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {q.choices.map((choice, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2.5 py-1.5",
                      i === q.answer ? "bg-positive/10 text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="font-semibold">{LETTERS[i]}</span>
                    <span className="min-w-0 flex-1">{choice}</span>
                    {i === q.answer && (
                      <LuCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-label="Correct" />
                    )}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="text-xs text-muted-foreground">{q.explanation}</p>}
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <QuestionDialog
          key={editing === "new" ? "new" : editing.id}
          quizId={quizId}
          question={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
