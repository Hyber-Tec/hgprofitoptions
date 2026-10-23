"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import type { ActionResult } from "@/core/domain/types"
import { LEVEL_LABELS, levelAfterPass, type TraderLevel } from "@/core/levels"
import { drawQuestions, gradeAttempt, passes, type Grade } from "@/core/quiz"
import { writeAudit } from "@/server/members"
import {
  COLLECTIONS,
  isDocId,
  parseDoc,
  quizAssignmentSchema,
  quizAttemptSchema,
  quizSchema,
  type QuizAttemptDoc,
  type QuizDoc,
} from "@/server/model"
import { activeMemberForAction, type Viewer } from "@/lib/auth/guards"
import { adminDb } from "@/lib/firebase/admin"

const unauthorized = {
  ok: false,
  code: "unauthorized",
  message: "Your session has ended. Please sign in again.",
} as const
const gone = { ok: false, code: "not-found", message: "This quiz is no longer available." } as const

const db = () => adminDb()
const quizRef = (id: string) => db().collection(COLLECTIONS.quizzes).doc(id)
const attemptRef = (id: string) => db().collection(COLLECTIONS.quizAttempts).doc(id)
const assignmentRef = (id: string) => db().collection(COLLECTIONS.quizAssignments).doc(id)

async function readQuiz(id: string): Promise<QuizDoc | null> {
  const snap = await quizRef(id).get()
  return snap.exists ? parseDoc(quizSchema, snap.id, snap.data()) : null
}

async function ownAttempt(viewer: Viewer, id: unknown): Promise<QuizAttemptDoc | null> {
  if (!isDocId(id)) return null
  const snap = await attemptRef(id).get()
  const attempt = snap.exists ? parseDoc(quizAttemptSchema, snap.id, snap.data()) : null
  return attempt?.uid === viewer.uid ? attempt : null
}

function newAttempt(viewer: Viewer, quiz: QuizDoc, assignmentId: string | null) {
  const questionIds = drawQuestions(quiz.questions, quiz.perAttempt)
  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    kind: quiz.kind,
    uid: viewer.uid,
    memberName: viewer.fullName,
    assignmentId,
    questionIds,
    answers: questionIds.map(() => null),
    correct: 0,
    score: null,
    passed: null,
    startedAt: Timestamp.now(),
    submittedAt: null,
  }
}

/** A fresh set of questions from a published practice quiz. */
export async function startPractice(quizId: string): Promise<ActionResult<{ attemptId: string }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  if (!isDocId(quizId)) return gone
  const quiz = await readQuiz(quizId)
  if (!quiz || quiz.kind !== "practice" || quiz.status !== "published" || quiz.questions.length === 0) return gone
  const ref = db().collection(COLLECTIONS.quizAttempts).doc()
  await ref.set(newAttempt(viewer, quiz, null))
  return { ok: true, data: { attemptId: ref.id } }
}

/** Starts (or resumes) a test an admin assigned. Each assignment allows one attempt. */
export async function startTest(assignmentId: string): Promise<ActionResult<{ attemptId: string }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  if (!isDocId(assignmentId)) return gone
  const ref = assignmentRef(assignmentId)
  const result = await db().runTransaction(async (tx): Promise<ActionResult<{ attemptId: string }>> => {
    const snap = await tx.get(ref)
    const assignment = snap.exists ? parseDoc(quizAssignmentSchema, snap.id, snap.data()) : null
    if (!assignment || assignment.uid !== viewer.uid || assignment.status === "cancelled") return gone
    if (assignment.status === "completed")
      return { ok: false, code: "conflict", message: "You have already taken this test." }
    if (assignment.attemptId) return { ok: true, data: { attemptId: assignment.attemptId } }
    const quizSnap = await tx.get(quizRef(assignment.quizId))
    const quiz = quizSnap.exists ? parseDoc(quizSchema, quizSnap.id, quizSnap.data()) : null
    if (!quiz || quiz.status !== "published" || quiz.questions.length === 0) return gone
    const attempt = db().collection(COLLECTIONS.quizAttempts).doc()
    tx.set(attempt, newAttempt(viewer, quiz, assignment.id))
    tx.update(ref, { status: "started", attemptId: attempt.id })
    return { ok: true, data: { attemptId: attempt.id } }
  })
  if (result.ok) refresh()
  return result
}

/**
 * Practice: records one answer and tells the member at once whether it was right, with the explanation.
 * An answer that was already given stays as it was.
 */
export async function answerPractice(
  attemptId: string,
  index: number,
  choice: number,
): Promise<ActionResult<{ correct: boolean; answer: number; explanation: string }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const attempt = await ownAttempt(viewer, attemptId)
  if (!attempt || attempt.kind !== "practice" || attempt.submittedAt) return gone
  const questionId = attempt.questionIds[index]
  if (questionId === undefined || !Number.isInteger(choice) || choice < 0)
    return { ok: false, code: "validation", message: "Pick an answer." }
  const quiz = await readQuiz(attempt.quizId)
  const question = quiz?.questions.find((q) => q.id === questionId)
  if (!question) return gone
  const given = attempt.answers[index] ?? choice
  if (attempt.answers[index] === null) {
    const answers = [...attempt.answers]
    answers[index] = choice
    await attemptRef(attempt.id).update({ answers })
  }
  return {
    ok: true,
    data: { correct: given === question.answer, answer: question.answer, explanation: question.explanation },
  }
}

/** Practice: the score once the member has gone through every question. */
export async function finishPractice(attemptId: string): Promise<ActionResult<Grade>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const attempt = await ownAttempt(viewer, attemptId)
  if (!attempt || attempt.kind !== "practice") return gone
  const quiz = await readQuiz(attempt.quizId)
  const grade = gradeAttempt(quiz?.questions ?? [], attempt.questionIds, attempt.answers)
  if (!attempt.submittedAt)
    await attemptRef(attempt.id).update({ correct: grade.correct, score: grade.score, submittedAt: Timestamp.now() })
  refresh()
  return { ok: true, data: grade }
}

/** Test: keeps an answer as the member goes, so a reload or a lost connection does not lose it. */
export async function saveTestAnswer(attemptId: string, index: number, choice: number | null): Promise<ActionResult> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const attempt = await ownAttempt(viewer, attemptId)
  if (!attempt || attempt.kind !== "test") return gone
  if (attempt.submittedAt) return { ok: false, code: "conflict", message: "This test was already submitted." }
  if (!Number.isInteger(index) || index < 0 || index >= attempt.questionIds.length)
    return { ok: false, code: "validation", message: "Unknown question." }
  if (choice !== null && (!Number.isInteger(choice) || choice < 0))
    return { ok: false, code: "validation", message: "Pick an answer." }
  const answers = [...attempt.answers]
  answers[index] = choice
  await attemptRef(attempt.id).update({ answers })
  return { ok: true, data: undefined }
}

/**
 * Test: grades every answer at once. Passing a test that awards a level moves a beginner up (a level
 * never goes down this way, and an admin can still change it later).
 */
export async function submitTest(
  attemptId: string,
  answers: (number | null)[],
): Promise<ActionResult<Grade & { passed: boolean; passScore: number; newLevel: string | null }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const attempt = await ownAttempt(viewer, attemptId)
  if (!attempt || attempt.kind !== "test") return gone
  if (attempt.submittedAt) return { ok: false, code: "conflict", message: "This test was already submitted." }
  if (!Array.isArray(answers) || answers.length !== attempt.questionIds.length)
    return { ok: false, code: "validation", message: "Answer every question before submitting." }
  const clean = answers.map((a) => (Number.isInteger(a) && (a as number) >= 0 ? (a as number) : null))
  const quiz = await readQuiz(attempt.quizId)
  if (!quiz) return gone
  const grade = gradeAttempt(quiz.questions, attempt.questionIds, clean)
  const passed = passes(grade.score, quiz.passScore)
  const memberRef = db().collection(COLLECTIONS.members).doc(viewer.uid)
  const newLevel = await db().runTransaction(async (tx) => {
    const fresh = await tx.get(attemptRef(attempt.id))
    if (fresh.get("submittedAt")) return null
    const memberSnap = await tx.get(memberRef)
    const now = Timestamp.now()
    tx.update(attemptRef(attempt.id), {
      answers: clean,
      correct: grade.correct,
      score: grade.score,
      passed,
      submittedAt: now,
    })
    if (attempt.assignmentId)
      tx.update(assignmentRef(attempt.assignmentId), {
        status: "completed",
        score: grade.score,
        passed,
        completedAt: now,
      })
    const current = (memberSnap.get("level") as TraderLevel | undefined) ?? "beginner"
    if (!passed || !quiz.awardsLevel) return null
    const next = levelAfterPass(current, quiz.awardsLevel)
    if (next === current) return null
    tx.update(memberRef, { level: next, levelSetBy: "test", levelSetAt: now })
    return next
  })
  await writeAudit(db(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: passed ? "quiz.passed" : "quiz.failed",
    targetType: "quiz",
    targetId: quiz.id,
    detail: { score: Math.round(grade.score * 100), level: newLevel },
  })
  refresh()
  return {
    ok: true,
    data: { ...grade, passed, passScore: quiz.passScore, newLevel: newLevel ? LEVEL_LABELS[newLevel] : null },
  }
}
