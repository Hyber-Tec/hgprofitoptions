/**
 * The AI's work on quizzes, shared by the Cloud Function and (in local development) the web server: read
 * the source document, write questions, add them to the bank.
 */
import { randomUUID } from "node:crypto"
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { AiError, writeQuizQuestions, type AiConfig } from "./ai"
import { aiDocument } from "./documents"
import { COLLECTIONS, parseDoc, quizSchema } from "./model"

/** The part of a Cloud Storage bucket this needs (the Admin SDK's Bucket). */
export interface StoredFiles {
  file(path: string): {
    download(): Promise<[Buffer]>
    getMetadata(): Promise<[{ contentType?: string }, ...unknown[]]>
  }
}

/**
 * Runs a pending generation once: the first caller claims it, later callers (a trigger that fires twice)
 * leave. Failures are written to the quiz so the admin sees why. Returns the number of questions added.
 */
export async function runQuizGeneration(
  db: Firestore,
  files: StoredFiles,
  ai: AiConfig | null,
  quizId: string,
  claimId: string,
): Promise<number> {
  const ref = db.collection(COLLECTIONS.quizzes).doc(quizId)
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const quiz = snap.exists ? parseDoc(quizSchema, snap.id, snap.data()) : null
    if (!quiz?.generation || quiz.generation.status !== "pending") return null
    tx.update(ref, { "generation.status": "running", "generation.claimId": claimId })
    return quiz
  })
  if (!claimed?.generation) return 0

  const fail = (message: string) =>
    ref.update({
      "generation.status": "failed",
      "generation.message": message,
      "generation.finishedAt": Timestamp.now(),
    })
  if (!ai) {
    await fail("AI is not set up on the server yet.")
    return 0
  }
  if (!claimed.source?.path) {
    await fail("This quiz has no document to write questions from.")
    return 0
  }
  try {
    const file = files.file(claimed.source.path)
    const [[data], [metadata]] = await Promise.all([file.download(), file.getMetadata()])
    const doc = aiDocument(
      claimed.source.name,
      new Uint8Array(data),
      claimed.source.contentType ?? metadata.contentType ?? null,
    )
    const written = await writeQuizQuestions(ai, doc, {
      count: claimed.generation.count,
      avoid: claimed.questions.map((q) => q.prompt),
    })
    if (written.length === 0) {
      await fail("The AI found nothing to ask in this document.")
      return 0
    }
    const questions = written.map((q) => ({ ...q, id: randomUUID().slice(0, 8) }))
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const current = snap.exists ? parseDoc(quizSchema, snap.id, snap.data()) : null
      if (!current) return
      tx.update(ref, {
        questions: [...current.questions, ...questions],
        "generation.status": "done",
        "generation.message": null,
        "generation.finishedAt": Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    })
    return questions.length
  } catch (error) {
    await fail(error instanceof AiError ? error.message : "Something went wrong while writing questions. Try again.")
    if (!(error instanceof AiError)) console.error(`Quiz ${quizId} generation failed:`, error)
    return 0
  }
}
