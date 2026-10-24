import "server-only"
import { cache } from "react"
import { isUnread, type ChatMessage, type ChatThread } from "@/core/chat"
import { answersQuestions } from "@/core/levels"
import {
  COLLECTIONS,
  MEMBER_SUBCOLLECTIONS,
  MESSAGES,
  isDocId,
  parseDoc,
  threadMessageSchema,
  threadSchema,
  type ThreadDoc,
  type ThreadMessageDoc,
} from "@/server/model"
import type { Viewer } from "@/lib/auth/guards"
import { adminDb } from "@/lib/firebase/admin"

export const toChatThread = (t: ThreadDoc): ChatThread => ({
  ...t,
  createdAt: t.createdAt.getTime(),
  lastMessageAt: t.lastMessageAt.getTime(),
})

export const toChatMessage = (m: ThreadMessageDoc): ChatMessage => ({ ...m, createdAt: m.createdAt.getTime() })

const threads = () => adminDb().collection(COLLECTIONS.threads)

/** The threads this person may read, newest activity first (the same rules as the browser listeners). */
export async function listThreadsFor(viewer: Viewer): Promise<ChatThread[]> {
  const queries = answersQuestions(viewer.member)
    ? [threads().orderBy("lastMessageAt", "desc").limit(100)]
    : [
        threads().where("visibility", "==", "class").orderBy("lastMessageAt", "desc").limit(100),
        threads().where("askerUid", "==", viewer.uid).orderBy("lastMessageAt", "desc").limit(50),
      ]
  const snaps = await Promise.all(queries.map((q) => q.get()))
  const byId = new Map<string, ChatThread>()
  for (const snap of snaps)
    for (const doc of snap.docs) {
      const parsed = parseDoc(threadSchema, doc.id, doc.data())
      if (parsed) byId.set(doc.id, toChatThread(parsed))
    }
  return [...byId.values()].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

/** One thread and its messages, or null when it does not exist or this person may not read it. */
export async function getThreadFor(
  viewer: Viewer,
  id: string,
): Promise<{ thread: ChatThread; messages: ChatMessage[] } | null> {
  if (!isDocId(id)) return null
  const snap = await threads().doc(id).get()
  const thread = snap.exists ? parseDoc(threadSchema, snap.id, snap.data()) : null
  if (!thread) return null
  const readable = thread.visibility === "class" || thread.askerUid === viewer.uid || answersQuestions(viewer.member)
  if (!readable) return null
  const messages = await snap.ref.collection(MESSAGES).orderBy("createdAt").limit(500).get()
  return {
    thread: toChatThread(thread),
    messages: messages.docs
      .map((d) => parseDoc(threadMessageSchema, d.id, d.data()))
      .filter((m): m is ThreadMessageDoc => m !== null)
      .map(toChatMessage),
  }
}

/** When this member last saw each thread (epoch milliseconds). */
export async function readThreadReads(uid: string): Promise<Record<string, number>> {
  const snap = await adminDb()
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.threadReads)
    .get()
  return Object.fromEntries(
    snap.docs.map((d) => [d.id, (d.get("lastReadAt") as { toMillis: () => number } | undefined)?.toMillis() ?? 0]),
  )
}

/**
 * The sidebar count: for advanced traders and admins, questions waiting for an answer; for everyone else, their
 * own questions with a reply they have not read yet.
 */
export const chatBadge = cache(async (viewer: Viewer): Promise<number> => {
  if (!viewer.hasAccess) return 0
  if (answersQuestions(viewer.member)) {
    const waiting = await threads().where("status", "==", "open").count().get()
    return waiting.data().count
  }
  const [own, reads] = await Promise.all([
    threads().where("askerUid", "==", viewer.uid).orderBy("lastMessageAt", "desc").limit(50).get(),
    readThreadReads(viewer.uid),
  ])
  return own.docs
    .map((d) => parseDoc(threadSchema, d.id, d.data()))
    .filter((t): t is ThreadDoc => t !== null)
    .filter((t) => isUnread(toChatThread(t), viewer.uid, reads)).length
})
