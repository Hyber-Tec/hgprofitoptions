"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LuPlay } from "react-icons/lu"
import { startPractice, startTest } from "@/lib/actions/quizzes"
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
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

/** Starts a fresh round of a practice quiz. */
export function StartPracticeButton({ quizId, again = false }: { quizId: string; again?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const start = () =>
    startTransition(async () => {
      const result = await startPractice(quizId)
      if (!result.ok) {
        toast.add({ title: "Could not start", description: result.message, type: "error" })
        return
      }
      router.push(`/members/quizzes/attempts/${result.data.attemptId}`)
    })
  return (
    <Button size="sm" variant={again ? "outline" : "default"} onClick={start} disabled={pending}>
      {pending ? <Spinner /> : <LuPlay />}
      {again ? "Practice again" : "Practice"}
    </Button>
  )
}

/** Starts (or resumes) an assigned test, after saying how it works. */
export function StartTestButton({
  assignmentId,
  title,
  questions,
  passPercent,
  started,
}: {
  assignmentId: string
  title: string
  questions: number
  passPercent: number
  started: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const start = () =>
    startTransition(async () => {
      const result = await startTest(assignmentId)
      if (!result.ok) {
        toast.add({ title: "Could not start", description: result.message, type: "error" })
        return
      }
      router.push(`/members/quizzes/attempts/${result.data.attemptId}`)
    })
  if (started)
    return (
      <Button size="sm" onClick={start} disabled={pending}>
        {pending ? <Spinner /> : <LuPlay />}
        Continue test
      </Button>
    )
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" />}>
        <LuPlay />
        Start test
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {questions} questions. You need {passPercent}% to pass, and you get one try, so take your time. You can go
            back and change answers until you submit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction onClick={start} disabled={pending}>
            {pending && <Spinner />}
            Start
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
