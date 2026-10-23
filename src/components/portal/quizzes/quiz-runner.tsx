"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuArrowLeft, LuArrowRight, LuCheck, LuTrophy, LuX } from "react-icons/lu"
import { formatPercent } from "@/core/format"
import { answerPractice, finishPractice, saveTestAnswer, submitTest } from "@/lib/actions/quizzes"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ButtonLink } from "@/components/shared/button-link"
import { StartPracticeButton } from "./start-buttons"

export interface RunnerQuestion {
  prompt: string
  choices: string[]
  /** The member's answer so far (practice, and tests in progress). */
  given: number | null
  /** The correct choice, once it may be shown (practice answers already given). */
  answer: number | null
  explanation: string | null
}

const LETTERS = ["A", "B", "C", "D", "E", "F"]
const percent = (score: number) => formatPercent(score, { digits: 0, signed: false })

function Choice({
  letter,
  text,
  state,
  onClick,
  disabled,
}: {
  letter: string
  text: string
  state: "idle" | "selected" | "correct" | "wrong" | "muted"
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state === "selected"}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default",
        state === "idle" && "hover:bg-muted/50",
        state === "selected" && "border-primary bg-primary/5",
        state === "correct" && "border-positive bg-positive/10",
        state === "wrong" && "border-negative bg-negative/10",
        state === "muted" && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          state === "selected" && "border-primary bg-primary text-primary-foreground",
          state === "correct" && "border-positive bg-positive text-background",
          state === "wrong" && "border-negative bg-negative text-background",
        )}
        aria-hidden="true"
      >
        {state === "correct" ? (
          <LuCheck className="size-3.5" />
        ) : state === "wrong" ? (
          <LuX className="size-3.5" />
        ) : (
          letter
        )}
      </span>
      <span className="pt-0.5">{text}</span>
    </button>
  )
}

/**
 * Takes a member through one attempt. Practice shows right or wrong and the explanation after each
 * answer; a test keeps answers (saved as the member goes) until they submit, then shows the score.
 */
export function QuizRunner({
  attemptId,
  quizId,
  title,
  kind,
  questions,
  submitted,
  result,
}: {
  attemptId: string
  quizId: string
  title: string
  kind: "practice" | "test"
  questions: RunnerQuestion[]
  submitted: boolean
  /** The finished attempt's score (and, for a test, pass or fail). */
  result: { correct: number; total: number; score: number; passed: boolean | null; passScore: number } | null
}) {
  const router = useRouter()
  const firstOpen = questions.findIndex((q) => q.given === null)
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen)
  const [answers, setAnswers] = useState(questions.map((q) => q.given))
  const [revealed, setRevealed] = useState(
    questions.map((q) => (q.answer === null ? null : { answer: q.answer, explanation: q.explanation ?? "" })),
  )
  const [confirming, setConfirming] = useState(false)
  const [levelUp, setLevelUp] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (submitted && result) {
    return (
      <Results
        title={title}
        kind={kind}
        quizId={quizId}
        result={result}
        levelUp={levelUp}
        questions={kind === "practice" ? questions : []}
      />
    )
  }

  const total = questions.length
  const question = questions[index]
  if (!question) return null
  const shown = revealed[index]
  const chosen = answers[index] ?? null
  const answeredCount = answers.filter((a) => a !== null).length
  const last = index === total - 1

  const choose = (choice: number) => {
    if (kind === "practice") {
      if (shown) return
      setAnswers((list) => list.map((a, i) => (i === index ? choice : a)))
      startTransition(async () => {
        const res = await answerPractice(attemptId, index, choice)
        if (!res.ok) {
          toast.add({ title: "Not saved", description: res.message, type: "error" })
          return
        }
        setRevealed((list) => list.map((r, i) => (i === index ? res.data : r)))
      })
      return
    }
    setAnswers((list) => list.map((a, i) => (i === index ? choice : a)))
    void saveTestAnswer(attemptId, index, choice).then((res) => {
      if (!res.ok) toast.add({ title: "Answer not saved", description: res.message, type: "error" })
    })
  }

  const finish = () =>
    startTransition(async () => {
      if (kind === "practice") {
        const res = await finishPractice(attemptId)
        if (!res.ok) toast.add({ title: "Could not finish", description: res.message, type: "error" })
        else router.refresh()
        return
      }
      const res = await submitTest(attemptId, answers)
      if (!res.ok) {
        toast.add({ title: "Not submitted", description: res.message, type: "error" })
        return
      }
      setLevelUp(res.data.newLevel)
      router.refresh()
    })

  const stateOf = (i: number): "idle" | "selected" | "correct" | "wrong" | "muted" => {
    if (kind === "test") return chosen === i ? "selected" : "idle"
    if (!shown) return chosen === i ? "selected" : "idle"
    if (i === shown.answer) return "correct"
    if (i === chosen) return "wrong"
    return "muted"
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {title} · {kind === "test" ? "Test" : "Practice"}
          </span>
          <span className="tabular-nums">
            Question {index + 1} of {total}
          </span>
        </div>
        <Progress
          value={((kind === "test" ? answeredCount : index + (shown ? 1 : 0)) / total) * 100}
          aria-label="Progress"
        />
      </div>

      <h2 className="text-lg leading-snug font-semibold text-balance sm:text-xl">{question.prompt}</h2>

      <div className="flex flex-col gap-2.5" role="group" aria-label="Answers">
        {question.choices.map((text, i) => (
          <Choice
            key={i}
            letter={LETTERS[i] ?? String(i + 1)}
            text={text}
            state={stateOf(i)}
            onClick={() => choose(i)}
            disabled={kind === "practice" && (shown !== null || pending)}
          />
        ))}
      </div>

      {kind === "practice" && shown && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            chosen === shown.answer ? "border-positive/40 bg-positive/8" : "border-negative/40 bg-negative/8",
          )}
          role="status"
        >
          <p className="font-semibold">{chosen === shown.answer ? "Correct" : "Not quite"}</p>
          {shown.explanation && <p className="mt-1 text-muted-foreground">{shown.explanation}</p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {kind === "test" && index > 0 ? (
          <Button variant="outline" onClick={() => setIndex(index - 1)}>
            <LuArrowLeft />
            Back
          </Button>
        ) : (
          <span />
        )}
        {last ? (
          <Button
            onClick={() => (kind === "test" && answeredCount < total ? setConfirming(true) : finish())}
            disabled={pending || (kind === "practice" ? !shown : chosen === null && answeredCount === 0)}
          >
            {pending && <Spinner />}
            {kind === "test" ? "Submit test" : "See your score"}
          </Button>
        ) : (
          <Button onClick={() => setIndex(index + 1)} disabled={kind === "practice" ? !shown : false}>
            Next
            <LuArrowRight />
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with unanswered questions?</AlertDialogTitle>
            <AlertDialogDescription>
              You answered {answeredCount} of {total}. Unanswered questions count as wrong, and you get one try.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false)
                finish()
              }}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Results({
  title,
  kind,
  quizId,
  result,
  levelUp,
  questions,
}: {
  title: string
  kind: "practice" | "test"
  quizId: string
  result: { correct: number; total: number; score: number; passed: boolean | null; passScore: number }
  levelUp: string | null
  questions: RunnerQuestion[]
}) {
  const passed = result.passed === true
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-8 text-center">
        {kind === "test" && passed && <LuTrophy className="size-8 text-positive" aria-hidden="true" />}
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-4xl font-semibold tracking-tight tabular-nums">{percent(result.score)}</p>
        <p className="text-sm">
          {result.correct} of {result.total} correct
          {kind === "test" &&
            (passed
              ? " · you passed"
              : ` · you need ${percent(result.passScore)} to pass. HG's team can give you another try.`)}
        </p>
        {levelUp && <p className="font-medium text-positive">You are now an {levelUp} trader.</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {kind === "practice" && <StartPracticeButton quizId={quizId} again />}
          <ButtonLink size="sm" variant={kind === "practice" ? "ghost" : "default"} href="/members/quizzes">
            Back to quizzes
          </ButtonLink>
        </div>
      </div>

      {questions.length > 0 && (
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => {
            const right = q.given !== null && q.given === q.answer
            return (
              <li key={i} className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
                <p className="flex items-start gap-2 font-medium">
                  {right ? (
                    <LuCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-label="Correct" />
                  ) : (
                    <LuX className="mt-0.5 size-4 shrink-0 text-negative" aria-label="Wrong" />
                  )}
                  {q.prompt}
                </p>
                <p className="text-muted-foreground">
                  {!right && q.given !== null && (
                    <>
                      Your answer: {q.choices[q.given]}
                      <br />
                    </>
                  )}
                  Answer: <span className="text-foreground">{q.answer !== null ? q.choices[q.answer] : "-"}</span>
                </p>
                {q.explanation && <p className="text-muted-foreground">{q.explanation}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
