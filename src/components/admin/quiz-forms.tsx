"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { LuArchive, LuEyeOff, LuSend, LuSparkles, LuTriangleAlert } from "react-icons/lu"
import { LEVEL_LABELS } from "@/core/levels"
import { createQuiz, setQuizStatus, updateQuizSettings, writeMoreQuestions } from "@/lib/actions/admin/quizzes"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { UploadField, type UploadedFile } from "./upload-field"

export interface QuizDocumentOption {
  path: string
  name: string
  contentType: string | null
}

const COUNTS = [5, 10, 15, 20, 25, 30].map((n) => ({ value: String(n), label: `${n} questions` }))

/** New quiz: a title, practice or test, and the class document the AI writes questions from. */
export function NewQuizForm({ documents, aiReady }: { documents: QuizDocumentOption[]; aiReady: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<"practice" | "test">("practice")
  const [upload, setUpload] = useState<UploadedFile | null>(null)
  const [existing, setExisting] = useState("upload")
  const [count, setCount] = useState("20")
  const [pending, startTransition] = useTransition()
  const items = [
    { value: "upload", label: "Upload a new file" },
    ...documents.map((d) => ({ value: d.path, label: d.name })),
  ]
  const picked = documents.find((d) => d.path === existing) ?? null
  const source =
    existing === "upload" ? upload && { path: upload.path, name: upload.name, contentType: upload.type } : picked

  const submit = () =>
    startTransition(async () => {
      const result = await createQuiz({ title, kind, source, count: aiReady && source ? Number(count) : 0 })
      if (!result.ok) {
        toast.add({ title: "Not created", description: result.message, type: "error" })
        return
      }
      router.push(`/admin/quizzes/${result.data.id}`)
    })

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {!aiReady && (
        <Alert>
          <LuTriangleAlert />
          <AlertTitle>AI is not connected yet</AlertTitle>
          <AlertDescription>You can still create the quiz and write the questions yourself.</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="q-title">Title</FieldLabel>
          <Input
            id="q-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Channels and BOC levels"
            required
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
              : "Only members you assign take it, once each. Passing makes a beginner an Advanced trader."}
          </FieldDescription>
        </Field>
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
        {aiReady && source && (
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
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending || title.trim().length < 2}>
          {pending ? <Spinner /> : aiReady && source ? <LuSparkles /> : null}
          {aiReady && source ? "Create and write questions" : "Create quiz"}
        </Button>
      </div>
    </form>
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
  const [awards, setAwards] = useState(initial.awardsLevel !== null)
  const [pending, startTransition] = useTransition()
  const save = () =>
    startTransition(async () => {
      const result = await updateQuizSettings(quizId, {
        title,
        description: description.trim() || null,
        perAttempt: Number(perAttempt),
        passScore: Number(passPercent) / 100,
        awardsLevel: awards ? "advanced" : null,
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
          <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Passing makes a beginner {LEVEL_LABELS.advanced}</span>
              <span className="block text-sm text-muted-foreground">
                Levels only go up this way. You can still set anyone&apos;s level on their member page.
              </span>
            </span>
            <Switch checked={awards} onCheckedChange={setAwards} />
          </label>
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
