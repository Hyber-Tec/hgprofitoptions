"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition, type ReactNode } from "react"
import {
  LuDownload,
  LuEye,
  LuEyeOff,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuSend,
  LuSparkles,
  LuTrash2,
  LuTriangleAlert,
  LuX,
} from "react-icons/lu"
import { isIsoDate } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { classTitle, type ClassSession } from "@/core/schedule"
import {
  createRecap,
  deleteRecap,
  rewriteRecap,
  saveRecap,
  saveRecording,
  setRecapPublished,
  uploadTranscript,
} from "@/lib/actions/admin/recaps"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ButtonAnchor } from "@/components/shared/button-link"
import { SendDialog, type SendableMember } from "./send-dialog"
import { UploadField, type UploadedFile } from "./upload-field"

const TRANSCRIPT_TYPES =
  ".vtt,.srt,.txt,.docx,.pdf,text/vtt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** A recap from a transcript file: Zoom's (.vtt) or any text, Word or PDF copy of what was said. */
export function NewRecapForm({
  aiReady,
  defaultDate,
  schedule,
}: {
  aiReady: boolean
  defaultDate: IsoDate
  schedule: ClassSession[]
}) {
  const router = useRouter()
  const [date, setDate] = useState<string>(defaultDate)
  const [title, setTitle] = useState(classTitle(defaultDate, schedule))
  const [titleEdited, setTitleEdited] = useState(false)
  const [file, setFile] = useState<UploadedFile | null>(null)
  const [pending, startTransition] = useTransition()
  const submit = () =>
    startTransition(async () => {
      if (!file) return
      const result = await createRecap({
        title,
        date,
        file: { path: file.path, name: file.name, contentType: file.type },
      })
      if (!result.ok) {
        toast.add({ title: "Not added", description: result.message, type: "error" })
        return
      }
      router.push(`/admin/recaps/${result.data.id}`)
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
          <AlertDescription>Recaps are written by AI. Add the AI key in the server settings first.</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="r-date">Date of the class</FieldLabel>
            <Input
              id="r-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                if (!titleEdited && isIsoDate(e.target.value)) setTitle(classTitle(e.target.value, schedule))
              }}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="r-title">Title</FieldLabel>
            <Input
              id="r-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleEdited(true)
              }}
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Transcript</FieldLabel>
          <UploadField
            folder="class-transcripts"
            accept={TRANSCRIPT_TYPES}
            value={file}
            onChange={setFile}
            label="Choose the transcript"
          />
          <FieldDescription>
            Zoom&apos;s transcript (.vtt) from the cloud recording, or a text, Word or PDF copy. Members never see the
            transcript, only the recap.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending || !aiReady || !file || title.trim().length < 2 || !isIsoDate(date)}>
          {pending ? <Spinner /> : <LuSparkles />}
          Write the recap
        </Button>
      </div>
    </form>
  )
}

/** While the AI works, the page refreshes itself; a failure shows why, with a way to try again. */
export function RecapStatus({
  recapId,
  status,
  message,
  canRetry,
}: {
  recapId: string
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
        <AlertTitle>AI is writing the recap</AlertTitle>
        <AlertDescription>
          This takes a minute or two. You can leave this page; the recap appears here.
        </AlertDescription>
      </Alert>
    )
  if (status !== "failed") return null
  return (
    <Alert variant="destructive">
      <LuTriangleAlert />
      <AlertTitle>The recap could not be written</AlertTitle>
      <AlertDescription>{message ?? "Try again."}</AlertDescription>
      {canRetry && (
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await rewriteRecap(recapId)
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

/** When Zoom's transcript could not be had: the admin downloads it from Zoom and uploads it here. */
export function UploadTranscript({ recapId }: { recapId: string }) {
  const [file, setFile] = useState<UploadedFile | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Upload the transcript</h2>
        <p className="text-sm text-muted-foreground">
          Download it from the class&apos;s cloud recording in Zoom, or use any text, Word or PDF copy.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <UploadField
          folder="class-transcripts"
          accept={TRANSCRIPT_TYPES}
          value={file}
          onChange={setFile}
          label="Choose the transcript"
        />
        {file && (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await uploadTranscript(recapId, {
                  path: file.path,
                  name: file.name,
                  contentType: file.type,
                })
                if (!result.ok) toast.add({ title: "Not started", description: result.message, type: "error" })
                else setFile(null)
              })
            }
          >
            {pending ? <Spinner /> : <LuSparkles />}
            Write the recap
          </Button>
        )}
      </div>
    </div>
  )
}

export function RecapActions({
  recapId,
  published,
  written,
  working,
  canRewrite,
  transcriptHref,
}: {
  recapId: string
  published: boolean
  written: boolean
  working: boolean
  canRewrite: boolean
  transcriptHref: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const publish = (next: boolean) =>
    startTransition(async () => {
      const result = await setRecapPublished(recapId, next)
      toast.add(
        result.ok
          ? { title: next ? "Members can read the recap" : "Recap hidden from members", type: "success" }
          : { title: "Not changed", description: result.message, type: "error" },
      )
    })
  return (
    <>
      {written &&
        (published ? (
          <Button size="sm" variant="outline" disabled={pending || working} onClick={() => publish(false)}>
            <LuEyeOff />
            Hide from members
          </Button>
        ) : (
          <Button size="sm" disabled={pending || working} onClick={() => publish(true)}>
            {pending ? <Spinner /> : <LuEye />}
            Publish
          </Button>
        ))}
      {canRewrite && written && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={pending || working} />}>
            <LuRefreshCw />
            Write again
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Write the recap again?</AlertDialogTitle>
              <AlertDialogDescription>
                The AI reads the transcript again and replaces this recap, including any changes you made.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep this one</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  startTransition(async () => {
                    const result = await rewriteRecap(recapId)
                    if (!result.ok) toast.add({ title: "Not started", description: result.message, type: "error" })
                  })
                }
              >
                Write again
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {transcriptHref && (
        <ButtonAnchor size="sm" variant="ghost" href={transcriptHref} download>
          <LuDownload />
          Transcript
        </ButtonAnchor>
      )}
      <AlertDialog>
        <AlertDialogTrigger render={<Button size="sm" variant="ghost" disabled={pending || working} />}>
          <LuTrash2 />
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recap?</AlertDialogTitle>
            <AlertDialogDescription>
              The recap and its transcript are removed for good. Members no longer see it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteRecap(recapId)
                  if (!result.ok) {
                    toast.add({ title: "Not deleted", description: result.message, type: "error" })
                    return
                  }
                  toast.add({ title: "Recap deleted", type: "success" })
                  router.push("/admin/recaps")
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export interface EditableRecap {
  title: string
  date: string
  summary: {
    overview: string
    keyPoints: string[]
    tickers: { symbol: string; note: string }[]
    actionItems: string[]
    questions: { question: string; answer: string }[]
  }
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")

/** The recap as members see it, with an Edit button that turns it into a form. */
export function RecapCard({
  recapId,
  initial,
  editable,
  children,
}: {
  recapId: string
  initial: EditableRecap
  editable: boolean
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "Edit the recap" : "Recap"}</CardTitle>
        <CardDescription>
          {editing
            ? "One key point or to-do per line. Leave a section empty to leave it out."
            : "What members read. Check what the AI wrote, and fix anything it got wrong."}
        </CardDescription>
        {editable && !editing && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <LuPencil />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? <RecapEditor recapId={recapId} initial={initial} onDone={() => setEditing(false)} /> : children}
      </CardContent>
    </Card>
  )
}

function RecapEditor({ recapId, initial, onDone }: { recapId: string; initial: EditableRecap; onDone: () => void }) {
  const [title, setTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date)
  const [overview, setOverview] = useState(initial.summary.overview)
  const [keyPoints, setKeyPoints] = useState(initial.summary.keyPoints.join("\n"))
  const [tickers, setTickers] = useState(initial.summary.tickers)
  const [actionItems, setActionItems] = useState(initial.summary.actionItems.join("\n"))
  const [questions, setQuestions] = useState(initial.summary.questions)
  const [pending, startTransition] = useTransition()
  const save = () =>
    startTransition(async () => {
      const result = await saveRecap(recapId, {
        title,
        date,
        summary: { overview, keyPoints: lines(keyPoints), tickers, actionItems: lines(actionItems), questions },
      })
      if (!result.ok) {
        toast.add({ title: "Not saved", description: result.message, type: "error" })
        return
      }
      toast.add({ title: "Recap saved", type: "success" })
      onDone()
    })
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field>
            <FieldLabel htmlFor="e-title">Title</FieldLabel>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="e-date">Date</FieldLabel>
            <Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="e-overview">Overview</FieldLabel>
          <Textarea id="e-overview" rows={4} value={overview} onChange={(e) => setOverview(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="e-points">Key points</FieldLabel>
          <Textarea id="e-points" rows={6} value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Tickers discussed</FieldLabel>
          <div className="flex flex-col gap-2">
            {tickers.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  className="w-24 shrink-0 font-mono uppercase"
                  value={t.symbol}
                  aria-label={`Ticker ${i + 1}`}
                  onChange={(e) =>
                    setTickers((list) => list.map((x, j) => (j === i ? { ...x, symbol: e.target.value } : x)))
                  }
                />
                <Textarea
                  className="min-h-9 min-w-0 flex-1"
                  value={t.note}
                  aria-label={`What was said about ${t.symbol || `ticker ${i + 1}`}`}
                  onChange={(e) =>
                    setTickers((list) => list.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${t.symbol || `ticker ${i + 1}`}`}
                  onClick={() => setTickers((list) => list.filter((_, j) => j !== i))}
                >
                  <LuX />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTickers((list) => [...list, { symbol: "", note: "" }])}
              >
                <LuPlus />
                Add a ticker
              </Button>
            </div>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="e-todo">Before the next class</FieldLabel>
          <Textarea id="e-todo" rows={3} value={actionItems} onChange={(e) => setActionItems(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Questions from the class</FieldLabel>
          <div className="flex flex-col gap-3">
            {questions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input
                    value={q.question}
                    aria-label={`Question ${i + 1}`}
                    placeholder="The question"
                    onChange={(e) =>
                      setQuestions((list) => list.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))
                    }
                  />
                  <Textarea
                    rows={2}
                    value={q.answer}
                    aria-label={`Answer ${i + 1}`}
                    placeholder="The answer given in class"
                    onChange={(e) =>
                      setQuestions((list) => list.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => setQuestions((list) => list.filter((_, j) => j !== i))}
                >
                  <LuX />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuestions((list) => [...list, { question: "", answer: "" }])}
              >
                <LuPlus />
                Add a question
              </Button>
            </div>
          </div>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Save the recap
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** The class recording's link (filled in from Zoom when it is connected) and sending it to members. */
export function RecordingCard({
  recapId,
  title,
  initialUrl,
  sent,
  members,
  emailReady,
}: {
  recapId: string
  title: string
  initialUrl: string | null
  /** "Sent Oct 25 to 23 members", once it was sent. */
  sent: string | null
  members: SendableMember[]
  emailReady: boolean
}) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [sending, setSending] = useState(false)
  const [pending, startTransition] = useTransition()
  const saved = (initialUrl ?? "") === url.trim()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recording</CardTitle>
        <CardDescription>
          {initialUrl
            ? (sent ?? "Not sent to members yet.")
            : "Paste the link to the class recording, then send it to members by email and in the app."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="r-recording" className="sr-only">
            Recording link
          </FieldLabel>
          <Input
            id="r-recording"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://zoom.us/rec/share/..."
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending || saved}
            onClick={() =>
              startTransition(async () => {
                const result = await saveRecording(recapId, url)
                toast.add(
                  result.ok
                    ? { title: url.trim() ? "Link saved" : "Link removed", type: "success" }
                    : { title: "Not saved", description: result.message, type: "error" },
                )
              })
            }
          >
            {pending && <Spinner />}
            Save link
          </Button>
          <Button disabled={!initialUrl || !saved} onClick={() => setSending(true)}>
            <LuSend />
            {sent ? "Send again" : "Send the recording"}
          </Button>
        </div>
      </CardContent>
      <SendDialog
        target={{ kind: "recording", recapId, title }}
        members={members}
        emailReady={emailReady}
        open={sending}
        onOpenChange={setSending}
      />
    </Card>
  )
}
