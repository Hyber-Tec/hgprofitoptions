"use server"

import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { messagePreview, threadTitle } from "@/core/chat"
import type { ActionResult } from "@/core/domain/types"
import { answersQuestions } from "@/core/levels"
import { notifyChat, type ChatEvent } from "@/server/chat"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS, MESSAGES, parseDoc, threadSchema, type ThreadDoc } from "@/server/model"
import { activeMemberForAction, adminForAction, type Viewer } from "@/lib/auth/guards"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"

const unauthorized = {
  ok: false,
  code: "unauthorized",
  message: "Your session has ended. Please sign in again.",
} as const
const notFound = { ok: false, code: "not-found", message: "This conversation is no longer available." } as const

const messageBody = z.string().trim().min(1, "Write your message first.").max(4000, "Keep it under 4,000 characters.")

const threads = () => adminDb().collection(COLLECTIONS.threads)
const readRef = (uid: string, threadId: string) =>
  adminDb().collection(COLLECTIONS.members).doc(uid).collection(MEMBER_SUBCOLLECTIONS.threadReads).doc(threadId)

function author(viewer: Viewer) {
  return {
    authorUid: viewer.uid,
    authorName: viewer.fullName,
    authorRole: viewer.role,
    authorLevel: viewer.member.level,
  }
}

function canRead(viewer: Viewer, thread: ThreadDoc): boolean {
  return thread.visibility === "class" || thread.askerUid === viewer.uid || answersQuestions(viewer.member)
}

/** Sends the notifications after the response, so posting never waits on them. */
function notifyLater(event: ChatEvent) {
  after(async () => {
    try {
      await notifyChat(adminDb(), adminMessaging(), event)
    } catch (error) {
      console.error("Chat notifications failed:", error instanceof Error ? error.message : error)
    }
  })
}

async function readThread(threadId: string): Promise<ThreadDoc | null> {
  if (typeof threadId !== "string" || threadId.length === 0 || threadId.length > 128) return null
  const snap = await threads().doc(threadId).get()
  return snap.exists ? parseDoc(threadSchema, snap.id, snap.data()) : null
}

/** A member's question starts a thread. "staffOnly" keeps it between them, the experts and the admins. */
export async function askQuestion(input: { body: string; staffOnly: boolean }): Promise<ActionResult<{ id: string }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const parsed = messageBody.safeParse(input.body)
  if (!parsed.success) return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "" }
  const text = parsed.data
  const now = Timestamp.now()
  const ref = threads().doc()
  const batch = adminDb().batch()
  batch.set(ref, {
    askerUid: viewer.uid,
    askerName: viewer.fullName,
    visibility: input.staffOnly ? "staff" : "class",
    title: threadTitle(text),
    status: "open",
    createdAt: now,
    lastMessageAt: now,
    lastMessageBy: viewer.uid,
    lastMessagePreview: messagePreview(text),
    messageCount: 1,
  })
  batch.set(ref.collection(MESSAGES).doc(), { ...author(viewer), body: text, createdAt: now, removed: false })
  batch.set(readRef(viewer.uid, ref.id), { lastReadAt: now })
  await batch.commit()
  notifyLater({
    kind: "question",
    threadId: ref.id,
    askerUid: viewer.uid,
    askerName: viewer.fullName,
    preview: messagePreview(text),
  })
  refresh()
  return { ok: true, data: { id: ref.id } }
}

/** The asker follows up, or an expert or admin answers. Everyone else reads along. */
export async function replyToThread(threadId: string, body: string): Promise<ActionResult> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const parsed = messageBody.safeParse(body)
  if (!parsed.success) return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "" }
  const thread = await readThread(threadId)
  if (!thread || !canRead(viewer, thread)) return notFound
  const isAsker = thread.askerUid === viewer.uid
  const helper = answersQuestions(viewer.member)
  if (!isAsker && !helper)
    return { ok: false, code: "forbidden", message: "Only the person who asked, experts and admins reply here." }
  const text = parsed.data
  const now = Timestamp.now()
  const ref = threads().doc(thread.id)
  const batch = adminDb().batch()
  batch.set(ref.collection(MESSAGES).doc(), { ...author(viewer), body: text, createdAt: now, removed: false })
  batch.update(ref, {
    lastMessageAt: now,
    lastMessageBy: viewer.uid,
    lastMessagePreview: messagePreview(text),
    messageCount: FieldValue.increment(1),
    // An answer from an expert or admin settles the question; a follow-up from the asker reopens it.
    status: isAsker ? "open" : "answered",
  })
  batch.set(readRef(viewer.uid, thread.id), { lastReadAt: now })
  await batch.commit()
  notifyLater({
    kind: "reply",
    threadId: thread.id,
    askerUid: thread.askerUid,
    author: { uid: viewer.uid, name: viewer.fullName, role: viewer.role, level: viewer.member.level },
    preview: messagePreview(text),
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Remembers that the member has seen the thread up to now (for the unread dots and the sidebar count). */
export async function markThreadRead(threadId: string): Promise<ActionResult> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const thread = await readThread(threadId)
  if (!thread || !canRead(viewer, thread)) return notFound
  await readRef(viewer.uid, thread.id).set({ lastReadAt: Timestamp.now() })
  refresh()
  return { ok: true, data: undefined }
}

/** Admins remove a message that should not be there. The thread keeps a "removed" marker. */
export async function removeMessage(threadId: string, messageId: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return { ok: false, code: "forbidden", message: "Admins only." }
  const thread = await readThread(threadId)
  if (!thread || typeof messageId !== "string" || messageId.length === 0) return notFound
  const ref = threads().doc(thread.id).collection(MESSAGES).doc(messageId)
  if (!(await ref.get()).exists) return notFound
  await ref.update({ removed: true, body: "" })
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "chat.message_removed",
    targetType: "thread",
    targetId: thread.id,
  })
  return { ok: true, data: undefined }
}

/** Admins delete a whole thread and its messages. */
export async function deleteThread(threadId: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return { ok: false, code: "forbidden", message: "Admins only." }
  const thread = await readThread(threadId)
  if (!thread) return notFound
  await adminDb().recursiveDelete(threads().doc(thread.id))
  await writeAudit(adminDb(), {
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    action: "chat.thread_deleted",
    targetType: "thread",
    targetId: thread.id,
    detail: { title: thread.title },
  })
  refresh()
  return { ok: true, data: undefined }
}
