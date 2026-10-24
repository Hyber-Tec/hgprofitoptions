"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { LuArchive, LuEyeOff, LuSend, LuSparkles, LuTriangleAlert } from "react-icons/lu"
import { parseExam, type ExamIssue, type ExamQuestion } from "@/core/exam"
import { plural } from "@/core/format"
import { LEVEL_LABELS, type TraderLevel } from "@/core/levels"
import { createQuiz, setQuizStatus, updateQuizSettings, writeMoreQuestions } from "@/lib/actions/admin/quizzes"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { UploadField, type UploadedFile } from "./upload-field"

const AWARD_ITEMS: { value: TraderLevel | "none"; label: string }[] = [
  { value: "intermediate", label: `Move them up to ${LEVEL_LABELS.intermediate}` },
  { value: "advanced", label: `Move them up to ${LEVEL_LABELS.advanced}` },
  { value: "none", label: "Keep their level as it is" },
]

export interface QuizDocumentOption {
  path: string
  name: string
  contentType: string | null
}

const COUNTS = [5, 10, 15, 20, 25, 30].map((n) => ({ value: String(n), label: `${n} questions` }))

type From = "document" | "topic" | "exam"

const EXAM_EXAMPLE = `1. What does BOC stand for?
Break of channel *
Bottom of candle
Base of chart

2. When does HG act on a break of the channel line?
a) On the first touch
b) After the close below it
c) At the open
Answer: b`

/**
 * New quiz: a title, practice or test, and where the questions come from: a class document or a topic
 * for the AI, or an exam pasted as written (Google Forms, a document or an email).
 */
export function NewQuizForm({ documents, aiReady }: { documents: QuizDocumentOption[]; aiReady: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<"practice" | "test">("practice")
  const [from, setFrom] = useState<From>("document")
  const [upload, setUpload] = useState<UploadedFile | null>(null)
  const [existing, setExisting] = useState("upload")
  const [count, setCount] = useState("20")
  const [topic, setTopic] = useState("")
  const [examText, setExamText] = useState("")
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [pending, startTransition] = useTransition()
  const items = [
    { value: "upload", label: "Upload a new file" },
    ...documents.map((d) => ({ value: d.path, label: d.name })),
  ]
  const picked = documents.find((d) => d.path === existing) ?? null
  const source =
    existing === "upload" ? upload && { path: upload.path, name: upload.name, contentType: upload.type } : picked
  const exam = useMemo(() => parseExam(examText), [examText])
  const examAnswers = exam.questions.map((q, i) => answers[i] ?? q.answer)
  const unanswered = examAnswers.filter((a) => a === null).length
  const writes = from !== "exam" && aiReady && (from === "topic" || source !== null)
  // An exam's own title (the line above its first question) is used when none is typed.
  const quizTitle = title.trim() || (from === "exam" ? (exam.title ?? "") : "")

  const submit = () =>
    startTransition(async () => {
      const result =
        from === "exam"
          ? await createQuiz({ from, title: quizTitle, kind, text: examText, answers: examAnswers })
          : from === "topic"
            ? await createQuiz({ from, title: quizTitle, kind, topic, count: Number(count) })
            : await createQuiz({ from, title: quizTitle, kind, source, count: writes ? Number(count) : 0 })
      if (!result.ok) {
        toast.add({ title: "Not created", description: result.message, type: "error" })
        return
      }
      router.push(`/admin/quizzes/${result.data.id}`)
    })
  const ready =
    quizTitle.length >= 2 &&
    (from === "document" ||
      (from === "topic" && aiReady && topic.trim().length >= 10) ||
      (from === "exam" && exam.questions.length > 0 && unanswered === 0))

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {!aiReady && from !== "exam" && (
        <Alert>
          <LuTriangleAlert />
          <AlertTitle>AI is not connected yet</AlertTitle>
          <AlertDescription>
            You can still create the quiz and write the questions yourself, or paste an exam.
          </AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel>Questions from</FieldLabel>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[from]}
            onValueChange={(v: string[]) => {
              const next = v[0] as From | undefined
              if (!next) return
              setFrom(next)
              // A pasted exam is usually the advancement test.
              if (next === "exam") setKind("test")
            }}
            aria-label="Questions from"
          >
            <ToggleGroupItem value="document">A class document</ToggleGroupItem>
            <ToggleGroupItem value="topic">A topic</ToggleGroupItem>
            <ToggleGroupItem value="exam">Paste an exam</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="q-title">Title</FieldLabel>
          <Input
            id="q-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={(from === "exam" ? exam.title : null) ?? "Channels and BOC levels"}
          />
        </Field>
        <Field>
          <FieldLabel>Kind</FieldLabel>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[kind]}
            onValueChange={(v: string[]) => v[0] && setKind(v[0] as "practice" | "test")}
            aria-label="Kind"
          >
            <ToggleGroupItem value="practice">Practice</ToggleGroupItem>
            <ToggleGroupItem value="test">Test</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            {kind === "practice"
              ? "Every member can practice as often as they like and sees the answers as they go."
              : "Only members you assign take it, once each. Passing the exam (80% by default) makes a beginner Intermediate."}
          </FieldDescription>
        </Field>
        {from === "document" && (
          <Field>
            <FieldLabel>Class document</FieldLabel>
            {documents.length > 0 && (
              <Select items={items} value={existing} onValueChange={(v: string | null) => setExisting(v ?? "upload")}>
                <SelectTrigger className="w-full" aria-label="Class document">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {existing === "upload" && (
              <UploadField
                folder="quiz-sources"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                value={upload}
                onChange={setUpload}
                label="Choose a PDF, Word or text file"
              />
            )}
            <FieldDescription>Notes, slides or handouts from class. PDFs up to 24 MB.</FieldDescription>
          </Field>
        )}
        {from === "topic" && (
          <Field>
            <FieldLabel htmlFor="q-topic">Topic</FieldLabel>
            <Textarea
              id="q-topic"
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="The break of channel: what it is, why HG waits for the close below the line, and how the BOC levels fit in."
            />
            <FieldDescription>
              What the questions should cover, in your own words. The more of HG&apos;s rules you write here, the closer
              the questions follow the class.
            </FieldDescription>
          </Field>
        )}
        {writes && (
          <Field>
            <FieldLabel>Questions for the AI to write</FieldLabel>
            <Select items={COUNTS} value={count} onValueChange={(v: string | null) => setCount(v ?? "20")}>
              <SelectTrigger className="w-48" aria-label="Questions for the AI to write">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>You can ask for more later, and edit or delete any of them.</FieldDescription>
          </Field>
        )}
        {from === "exam" && (
          <Field>
            <FieldLabel htmlFor="q-exam">The exam</FieldLabel>
            <Textarea
              id="q-exam"
              rows={12}
              className="max-h-[32rem] min-h-48 font-mono text-sm"
              value={examText}
              onChange={(e) => {
                setExamText(e.target.value)
                setAnswers({})
              }}
              placeholder={EXAM_EXAMPLE}
            />
            <FieldDescription>
              Paste the questions as written, from the Google Form, a document or an email. Mark each right answer with
              * or an &quot;Answer:&quot; line, or click it in the preview below.
            </FieldDescription>
          </Field>
        )}
      </FieldGroup>
      {from === "exam" && examText.trim() !== "" && (
        <ExamPreview
          questions={exam.questions}
          issues={exam.issues}
          answers={examAnswers}
          onAnswer={(question, answer) => setAnswers((a) => ({ ...a, [question]: answer }))}
        />
      )}
      <div>
        <Button type="submit" disabled={pending || !ready}>
          {pending ? <Spinner /> : writes ? <LuSparkles /> : null}
          {from === "exam"
            ? exam.questions.length > 0
              ? `Import ${plural(exam.questions.length, "question")}`
              : "Import"
            : writes
              ? "Create and write questions"
              : "Create quiz"}
        </Button>
        {from === "exam" && unanswered > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Pick the right answer for {plural(unanswered, "question")} to import the exam.
          </p>
        )}
      </div>
    </form>
  )
}

/** The pasted exam as members will see it, with the right answers marked and clickable. */
function ExamPreview({
  questions,
  issues,
  answers,
  onAnswer,
}: {
  questions: ExamQuestion[]
  issues: ExamIssue[]
  answers: (number | null)[]
  onAnswer: (question: number, answer: number) => void
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="Preview" aria-live="polite">
      <p className="text-sm font-medium">
        {questions.length === 0 ? "No questions read yet" : `${plural(questions.length, "question")} read`}
      </p>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {issues.map((issue) => (
            <li key={`${String(issue.line)}-${issue.message}`}>
              <span className="font-medium">Line {issue.line}:</span> {issue.message}
            </li>
          ))}
        </ul>
      )}
      <ol className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <li key={`${String(q.line)}-${q.prompt}`} className="rounded-lg border p-3">
            <p className="text-sm font-medium">
              {i + 1}. {q.prompt}
            </p>
            <RadioGroup
              value={answers[i] === null || answers[i] === undefined ? null : String(answers[i])}
              onValueChange={(v: unknown) => onAnswer(i, Number(v))}
              className="mt-2 gap-1.5"
              aria-label={`Right answer to question ${String(i + 1)}`}
            >
              {q.choices.map((choice, j) => (
                <label key={`${String(j)}-${choice}`} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value={String(j)} className="mt-0.5" />
                  <span className={answers[i] === j ? "font-medium" : "text-muted-foreground"}>{choice}</span>
                </label>
              ))}
            </RadioGroup>
            {answers[i] === null && <p className="mt-2 text-xs text-warning">Click the right answer.</p>}
            {q.explanation && <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** While the AI works, the page refreshes itself; a failure shows why, with a way to try again. */
export function GenerationStatus({
  quizId,
  status,
  message,
  canRetry,
}: {
  quizId: string
  status: "pending" | "running" | "done" | "failed"
  message: string | null
  canRetry: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const working = status === "pending" || status === "running"
  useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => router.refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [working, router])
  if (working)
    return (
      <Alert>
        <Spinner />
        <AlertTitle>AI is writing questions</AlertTitle>
        <AlertDescription>
          This takes a minute or two. You can leave this page; they appear here when done.
        </AlertDescription>
      </Alert>
    )
  if (status !== "failed") return null
  return (
    <Alert variant="destructive">
      <LuTriangleAlert />
      <AlertTitle>The AI could not write questions</AlertTitle>
      <AlertDescription>{message ?? "Try again."}</AlertDescription>
      {canRetry && (
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await writeMoreQuestions(quizId, 10)
                if (!result.ok) toast.add({ title: "Not started", description: result.message, type: "error" })
              })
            }
          >
            {pending && <Spinner />}
            Try again
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}

export function QuizStatusButtons({
  quizId,
  status,
  questions,
}: {
  quizId: string
  status: "draft" | "published" | "archived"
  questions: number
}) {
  const [pending, startTransition] = useTransition()
  const set = (next: "draft" | "published" | "archived", success: string) =>
    startTransition(async () => {
      const result = await setQuizStatus(quizId, next)
      toast.add(
        result.ok
          ? { title: success, type: "success" }
          : { title: "Not changed", description: result.message, type: "error" },
      )
    })
  return (
    <>
      {status !== "published" && (
        <Button size="sm" disabled={pending || questions === 0} onClick={() => set("published", "Published")}>
          {pending ? <Spinner /> : <LuSend />}
          Publish
        </Button>
      )}
      {status === "published" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("draft", "Unpublished")}>
          <LuEyeOff />
          Unpublish
        </Button>
      )}
      {status !== "archived" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("archived", "Archived")}>
          <LuArchive />
          Archive
        </Button>
      )}
    </>
  )
}

export function QuizSettingsForm({
  quizId,
  kind,
  initial,
}: {
  quizId: string
  kind: "practice" | "test"
  initial: {
    title: string
    description: string | null
    perAttempt: number
    passScore: number
    awardsLevel: string | null
  }
}) {
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? "")
  const [perAttempt, setPerAttempt] = useState(String(initial.perAttempt))
  const [passPercent, setPassPercent] = useState(String(Math.round(initial.passScore * 100)))
  const [awards, setAwards] = useState<TraderLevel | "none">((initial.awardsLevel as TraderLevel | null) ?? "none")
  const [pending, startTransition] = useTransition()
  const save = () =>
    startTransition(async () => {
      const result = await updateQuizSettings(quizId, {
        title,
        description: description.trim() || null,
        perAttempt: Number(perAttempt),
        passScore: Number(passPercent) / 100,
        awardsLevel: awards === "none" ? null : awards,
      })
      toast.add(
        result.ok
          ? { title: "Settings saved", type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
    })
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="s-title">Title</FieldLabel>
          <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="s-description">Description</FieldLabel>
          <Textarea
            id="s-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What it covers, in one line"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="s-per">Questions {kind === "test" ? "in the test" : "per round"}</FieldLabel>
            <Input
              id="s-per"
              type="number"
              min={1}
              max={100}
              value={perAttempt}
              onChange={(e) => setPerAttempt(e.target.value)}
            />
            <FieldDescription>Drawn at random from the questions below.</FieldDescription>
          </Field>
          {kind === "test" && (
            <Field>
              <FieldLabel htmlFor="s-pass">Pass mark (%)</FieldLabel>
              <Input
                id="s-pass"
                type="number"
                min={10}
                max={100}
                value={passPercent}
                onChange={(e) => setPassPercent(e.target.value)}
              />
            </Field>
          )}
        </div>
        {kind === "test" && (
          <Field>
            <FieldLabel htmlFor="s-awards">When someone passes</FieldLabel>
            <Select
              items={AWARD_ITEMS}
              value={awards}
              onValueChange={(v: string | null) => v && setAwards(v as TraderLevel | "none")}
            >
              <SelectTrigger id="s-awards" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AWARD_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              It happens the moment they pass, and a level only ever goes up this way. You can still set anyone&apos;s
              level on their member page.
            </FieldDescription>
          </Field>
        )}
      </FieldGroup>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending && <Spinner />}
          Save settings
        </Button>
      </div>
    </form>
  )
}
