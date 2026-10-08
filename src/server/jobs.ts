/** Records each scheduled job run in jobRuns (shown on the admin Market data page). */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { COLLECTIONS } from "./model"

export interface JobOutcome {
  status: "succeeded" | "skipped"
  detail: string | null
}

export const skipped = (detail: string): JobOutcome => ({ status: "skipped", detail })
export const succeeded = (detail: string | null = null): JobOutcome => ({ status: "succeeded", detail })

/** Runs `fn` and records how it went. Failures are recorded and rethrown so the platform retries or alerts. */
export async function runJob(db: Firestore, job: string, fn: () => Promise<JobOutcome>): Promise<JobOutcome> {
  const ref = db.collection(COLLECTIONS.jobRuns).doc()
  await ref.set({ job, status: "running", startedAt: Timestamp.now(), finishedAt: null, detail: null })
  try {
    const outcome = await fn()
    await ref.update({ status: outcome.status, detail: outcome.detail, finishedAt: Timestamp.now() })
    return outcome
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await ref.update({ status: "failed", detail: message.slice(0, 500), finishedAt: Timestamp.now() })
    throw error
  }
}

/** Deletes job runs older than `days` days. */
export async function pruneJobRuns(db: Firestore, days = 90): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000)
  const old = await db.collection(COLLECTIONS.jobRuns).where("startedAt", "<", cutoff).limit(500).get()
  const writer = db.bulkWriter()
  for (const d of old.docs) void writer.delete(d.ref)
  await writer.close()
  return old.size
}
