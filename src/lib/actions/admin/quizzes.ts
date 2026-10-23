"use server"

import { randomUUID } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import type { ActionResult } from "@/core/domain/types"
import { TRADER_LEVELS } from "@/core/levels"
import { writeAudit } from "@/server/members"
import { sendToMembers } from "@/server/push"
import { COLLECTIONS, memberSchema, parseDoc, quizAssignmentSchema, quizSchema, type QuizDoc } from "@/server/model"
import { runQuizGeneration } from "@/server/quizzes"
import { adminForAction, type Viewer } from "@/lib/auth/guards"
import { aiConfig } from "@/lib/env.server"
import { adminBucket, adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const
const missing = { ok: false, code: "not-found", message: "This quiz no longer exists." } as const

const quizzes = () => adminDb().collection(COLLECTIONS.quizzes)

async function readQuiz(id: string): Promise<QuizDoc | null> {
  if (typeof id !== "string" || id.length === 0 || id.length > 128) return null
  const snap = await quizzes().doc(id).get()
  return snap.exists ? parseDoc(quizSchema, snap.id, snap.data()) : null
}

function audit(viewer: Viewer, action: string, quizId: string, detail?: Record<string, unknown>) {
  return writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action,
    targetType: "quiz",
    targetId: quizId,
    detail,
  })
}

/**
 * Queues the AI's work on a quiz. A Cloud Function picks it up; in local development without the
 * Functions emulator (DELIVER_ALERTS_INLINE=true) the web server does it after responding.
 */
function queueGeneration(quizId: string) {
  if (process.env.DELIVER_ALERTS_INLINE !== "true") return
  after(() => runQuizGeneration(adminDb(), adminBucket(), aiConfig(), quizId, `inline-${randomUUID()}`))
}

const sourceInput = z
  .object({
    path: z.string().startsWith("content/").max(512),
    name: z.string().trim().min(1).max(200),
    contentType: z.string().max(200).nullable(),
  })
  .nullable()

const createInput = z.object({
  title: z.string().trim().min(2, "Give the quiz a title").max(120),
  kind: z.enum(["practice", "test"]),
  source: sourceInput,
  count: z.number().int().min(0).max(30),
})

/** A new quiz. With a document and AI set up, the AI writes the first questions right away. */
export async function createQuiz(input: z.input<typeof createInput>): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = createInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const { title, kind, source, count } = parsed.data
  const generate = source !== null && count > 0 && aiConfig() !== null
  const now = Timestamp.now()
  const ref = quizzes().doc()
  await ref.set({
    title,
    description: null,
    kind,
    status: "draft",
    source,
    questions: [],
    perAttempt: kind === "test" ? Math.max(count, 10) : 10,
    passScore: 0.8,
    awardsLevel: kind === "test" ? "advanced" : null,
    generation: generate
      ? { status: "pending", count, message: null, claimId: null, requestedAt: now, finishedAt: null }
      : null,
    createdAt: now,
    createdBy: viewer.uid,
    updatedAt: now,
    publishedAt: null,
  })
  await audit(viewer, "quiz.created", ref.id, { kind, questions: count })
  if (generate) queueGeneration(ref.id)
  refresh()
  return { ok: true, data: { id: ref.id } }
}

/** Asks the AI for more questions from the same document. */
export async function writeMoreQuestions(quizId: string, count: number): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const quiz = await readQuiz(quizId)
  if (!quiz) return missing
  if (!aiConfig()) return { ok: false, code: "unavailable", message: "AI is not set up on the server yet." }
  if (!quiz.source?.path) return { ok: false, code: "validation", message: "This quiz has no document to read." }
  if (quiz.generation?.status === "pending" || quiz.generation?.status === "running")
    return { ok: false, code: "conflict", message: "The AI is already writing questions for this quiz." }
  if (!Number.isInteger(count) || count < 1 || count > 30)
    return { ok: false, code: "validation", message: "Ask for 1 to 30 questions." }
  await quizzes()
    .doc(quiz.id)
    .update({
      generation: {
        status: "pending",
        count,
        message: null,
        claimId: null,
        requestedAt: Timestamp.now(),
        finishedAt: null,
      },
    })
  queueGeneration(quiz.id)
  refresh()
  return { ok: true, data: undefined }
}

const settingsInput = z.object({
  title: z.string().trim().min(2, "Give the quiz a title").max(120),
  description: z.string().trim().max(1000).nullable(),
  perAttempt: z.number().int().min(1, "Use at least one question").max(100),
  passScore: z.number().min(0.1).max(1),
  awardsLevel: z.enum(TRADER_LEVELS).nullable(),
})

export async function updateQuizSettings(quizId: string, input: z.input<typeof settingsInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const quiz = await readQuiz(quizId)
  if (!quiz) return missing
  const parsed = settingsInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  await quizzes()
    .doc(quiz.id)
    .update({
      ...parsed.data,
      description: parsed.data.description || null,
      awardsLevel: quiz.kind === "test" ? parsed.data.awardsLevel : null,
      updatedAt: Timestamp.now(),
    })
  await audit(viewer, "quiz.updated", quiz.id)
  refresh()
  return { ok: true, data: undefined }
}

const questionInput = z.object({
  id: z.string().max(40).nullable(),
  prompt: z.string().trim().min(5, "Write the question").max(1000),
  choices: z
    .array(z.string().trim().min(1, "Fill in every choice").max(300))
    .min(2, "Give at least two choices")
    .max(6),
  answer: z.number().int().min(0),
  explanation: z.string().trim().max(1000),
})

/** Adds a question, or replaces the one with the same id. */
export async function saveQuestion(quizId: string, input: z.input<typeof questionInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = questionInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the question." }
  if (parsed.data.answer >= parsed.data.choices.length)
    return { ok: false, code: "validation", message: "Mark the correct choice." }
  const ref = quizzes().doc(quizId)
  const found = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const quiz = snap.exists ? parseDoc(quizSchema, snap.id, snap.data()) : null
    if (!quiz) return false
    const question = { ...parsed.data, id: parsed.data.id ?? randomUUID().slice(0, 8) }
    const exists = quiz.questions.some((q) => q.id === question.id)
    const questions = exists
      ? quiz.questions.map((q) => (q.id === question.id ? question : q))
      : [...quiz.questions, question]
    tx.update(ref, { questions, updatedAt: Timestamp.now() })
    return true
  })
  if (!found) return missing
  refresh()
  return { ok: true, data: undefined }
}

export async function deleteQuestion(quizId: string, questionId: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const ref = quizzes().doc(quizId)
  const found = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const quiz = snap.exists ? parseDoc(quizSchema, snap.id, snap.data()) : null
    if (!quiz) return false
    tx.update(ref, { questions: quiz.questions.filter((q) => q.id !== questionId), updatedAt: Timestamp.now() })
    return true
  })
  if (!found) return missing
  refresh()
  return { ok: true, data: undefined }
}

/** Publishes, unpublishes or archives a quiz. Publishing needs enough questions for one attempt. */
export async function setQuizStatus(quizId: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const quiz = await readQuiz(quizId)
  if (!quiz) return missing
  if (status === "published" && quiz.questions.length === 0)
    return { ok: false, code: "validation", message: "Add some questions before publishing." }
  await quizzes()
    .doc(quiz.id)
    .update({
      status,
      updatedAt: Timestamp.now(),
      ...(status === "published" && !quiz.publishedAt ? { publishedAt: Timestamp.now() } : {}),
    })
  await audit(viewer, `quiz.${status}`, quiz.id)
  refresh()
  return { ok: true, data: undefined }
}

/** Asks members to take a test. Members who already have it waiting are skipped. */
export async function assignTest(quizId: string, uids: string[]): Promise<ActionResult<{ assigned: number }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const quiz = await readQuiz(quizId)
  if (!quiz) return missing
  if (quiz.kind !== "test") return { ok: false, code: "validation", message: "Only tests are assigned." }
  if (quiz.status !== "published") return { ok: false, code: "validation", message: "Publish the test first." }
  const unique = [...new Set(uids)].filter((uid) => typeof uid === "string" && uid.length > 0).slice(0, 500)
  if (unique.length === 0) return { ok: false, code: "validation", message: "Pick at least one member." }
  const db = adminDb()
  const [memberSnaps, open] = await Promise.all([
    db.getAll(...unique.map((uid) => db.collection(COLLECTIONS.members).doc(uid))),
    db
      .collection(COLLECTIONS.quizAssignments)
      .where("quizId", "==", quiz.id)
      .where("status", "in", ["assigned", "started"])
      .get(),
  ])
  const waiting = new Set(open.docs.map((d) => d.get("uid") as string))
  const batch = db.batch()
  const recipients: string[] = []
  for (const snap of memberSnaps) {
    const member = snap.exists ? parseDoc(memberSchema, snap.id, snap.data()) : null
    if (!member || waiting.has(snap.id)) continue
    batch.set(db.collection(COLLECTIONS.quizAssignments).doc(), {
      quizId: quiz.id,
      quizTitle: quiz.title,
      uid: snap.id,
      memberName: member.fullName,
      status: "assigned",
      assignedAt: Timestamp.now(),
      assignedBy: viewer.uid,
      attemptId: null,
      score: null,
      passed: null,
      completedAt: null,
    })
    recipients.push(snap.id)
  }
  if (recipients.length > 0) {
    await batch.commit()
    after(() =>
      sendToMembers(db, adminMessaging(), recipients, {
        title: "You have a test to take",
        body: `${quiz.title}: open Quizzes when you are ready.`,
        url: "/members/quizzes",
        tag: `test-${quiz.id}`,
      }).catch((error: unknown) => console.error("Test notifications failed:", error)),
    )
  }
  await audit(viewer, "quiz.assigned", quiz.id, { members: recipients.length })
  refresh()
  return { ok: true, data: { assigned: recipients.length } }
}

export async function cancelAssignment(assignmentId: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const ref = adminDb().collection(COLLECTIONS.quizAssignments).doc(assignmentId)
  const snap = await ref.get()
  const assignment = snap.exists ? parseDoc(quizAssignmentSchema, snap.id, snap.data()) : null
  if (!assignment) return { ok: false, code: "not-found", message: "This assignment no longer exists." }
  if (assignment.status === "completed")
    return { ok: false, code: "conflict", message: "This test is already done; it stays in the results." }
  await ref.update({ status: "cancelled" })
  await audit(viewer, "quiz.assignment_cancelled", assignment.quizId, { member: assignment.memberName })
  refresh()
  return { ok: true, data: undefined }
}
