import "server-only"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import {
  COLLECTIONS,
  parseDoc,
  quizAssignmentSchema,
  quizAttemptSchema,
  quizSchema,
  type QuizAssignmentDoc,
  type QuizAttemptDoc,
  type QuizDoc,
} from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

const db = () => adminDb()

function parseAll<T>(docs: QueryDocumentSnapshot[], parse: (id: string, data: unknown) => T | null) {
  return docs.map((d) => parse(d.id, d.data())).filter((x): x is T => x !== null)
}

const asQuiz = (id: string, data: unknown) => parseDoc(quizSchema, id, data)
const asAttempt = (id: string, data: unknown) => parseDoc(quizAttemptSchema, id, data)
const asAssignment = (id: string, data: unknown) => parseDoc(quizAssignmentSchema, id, data)

export async function getQuiz(id: string): Promise<QuizDoc | null> {
  if (id.length === 0 || id.length > 128) return null
  const snap = await db().collection(COLLECTIONS.quizzes).doc(id).get()
  return snap.exists ? asQuiz(snap.id, snap.data()) : null
}

/** Every quiz for the admin list, newest first. */
export async function listQuizzes(): Promise<QuizDoc[]> {
  const snap = await db().collection(COLLECTIONS.quizzes).orderBy("createdAt", "desc").limit(200).get()
  return parseAll(snap.docs, asQuiz)
}

/** Published practice quizzes with at least one question, for members. */
export async function listPracticeQuizzes(): Promise<QuizDoc[]> {
  const snap = await db()
    .collection(COLLECTIONS.quizzes)
    .where("kind", "==", "practice")
    .where("status", "==", "published")
    .get()
  return parseAll(snap.docs, asQuiz)
    .filter((q) => q.questions.length > 0)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
}

/** Tests an admin assigned to this member that are not done yet. */
export async function listOpenAssignments(uid: string): Promise<QuizAssignmentDoc[]> {
  const snap = await db()
    .collection(COLLECTIONS.quizAssignments)
    .where("uid", "==", uid)
    .where("status", "in", ["assigned", "started"])
    .get()
  return parseAll(snap.docs, asAssignment).sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime())
}

/** How many assigned tests this member has not finished (the sidebar badge). */
export async function countOpenAssignments(uid: string): Promise<number> {
  const snap = await db()
    .collection(COLLECTIONS.quizAssignments)
    .where("uid", "==", uid)
    .where("status", "in", ["assigned", "started"])
    .count()
    .get()
  return snap.data().count
}

/** The member's finished attempts, newest first. */
export async function listMyAttempts(uid: string, limit = 20): Promise<QuizAttemptDoc[]> {
  const snap = await db()
    .collection(COLLECTIONS.quizAttempts)
    .where("uid", "==", uid)
    .orderBy("startedAt", "desc")
    .limit(limit * 2)
    .get()
  return parseAll(snap.docs, asAttempt)
    .filter((a) => a.submittedAt !== null)
    .slice(0, limit)
}

export async function getAttempt(id: string): Promise<QuizAttemptDoc | null> {
  if (id.length === 0 || id.length > 128) return null
  const snap = await db().collection(COLLECTIONS.quizAttempts).doc(id).get()
  return snap.exists ? asAttempt(snap.id, snap.data()) : null
}

export async function listAssignmentsFor(quizId: string): Promise<QuizAssignmentDoc[]> {
  const snap = await db().collection(COLLECTIONS.quizAssignments).where("quizId", "==", quizId).get()
  return parseAll(snap.docs, asAssignment).sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())
}

/** Finished attempts of one quiz, newest first (the admin's results). */
export async function listAttemptsFor(quizId: string, limit = 100): Promise<QuizAttemptDoc[]> {
  const snap = await db()
    .collection(COLLECTIONS.quizAttempts)
    .where("quizId", "==", quizId)
    .orderBy("startedAt", "desc")
    .limit(limit)
    .get()
  return parseAll(snap.docs, asAttempt).filter((a) => a.submittedAt !== null)
}
