import { onAuthStateChanged } from "firebase/auth"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore"
import type { ChatMessage, ChatThread } from "@/core/chat"
import { TRADER_LEVELS } from "@/core/levels"
import { clientAuth } from "@/lib/firebase/client"
import { clientDb } from "@/lib/firebase/client-db"

const millis = (value: unknown) => (value as Timestamp | null | undefined)?.toMillis() ?? 0

function toThread(id: string, d: DocumentData): ChatThread {
  return {
    id,
    askerUid: String(d.askerUid ?? ""),
    askerName: String(d.askerName ?? ""),
    visibility: d.visibility === "staff" ? "staff" : "class",
    title: String(d.title ?? ""),
    status: d.status === "answered" ? "answered" : "open",
    createdAt: millis(d.createdAt),
    lastMessageAt: millis(d.lastMessageAt),
    lastMessageBy: String(d.lastMessageBy ?? ""),
    lastMessagePreview: String(d.lastMessagePreview ?? ""),
    messageCount: Number(d.messageCount ?? 0),
  }
}

function toMessage(id: string, d: DocumentData): ChatMessage {
  return {
    id,
    authorUid: String(d.authorUid ?? ""),
    authorName: String(d.authorName ?? ""),
    authorRole: d.authorRole === "admin" ? "admin" : d.authorRole === "editor" ? "editor" : "member",
    authorLevel: TRADER_LEVELS.find((level) => level === d.authorLevel) ?? "beginner",
    body: String(d.body ?? ""),
    createdAt: millis(d.createdAt),
    removed: d.removed === true,
  }
}

/** Runs `start` while the Firebase client user is this member; returns a function that stops everything. */
function whileSignedIn(uid: string, start: () => Unsubscribe[], onIdle: () => void): () => void {
  let stops: Unsubscribe[] = []
  const stopAll = () => {
    for (const stop of stops) stop()
    stops = []
  }
  const stopAuth = onAuthStateChanged(clientAuth(), (user) => {
    stopAll()
    if (user?.uid !== uid) {
      onIdle()
      return
    }
    stops = start()
  })
  return () => {
    stopAuth()
    stopAll()
  }
}

/**
 * The threads this member may read and when they last saw each one, live. Advanced traders and admins see every
 * thread; everyone else the class threads and their own (the same split as the security rules).
 */
export function listenToThreads(
  uid: string,
  staff: boolean,
  handlers: {
    onThreads: (threads: ChatThread[]) => void
    onReads: (reads: Record<string, number>) => void
    onIdle: () => void
  },
): () => void {
  return whileSignedIn(
    uid,
    () => {
      const db = clientDb()
      const threads = collection(db, "threads")
      const queries = staff
        ? [query(threads, orderBy("lastMessageAt", "desc"), limit(100))]
        : [
            query(threads, where("visibility", "==", "class"), orderBy("lastMessageAt", "desc"), limit(100)),
            query(threads, where("askerUid", "==", uid), orderBy("lastMessageAt", "desc"), limit(50)),
          ]
      const parts = new Map<number, ChatThread[]>()
      const emit = () => {
        if (parts.size < queries.length) return
        const byId = new Map<string, ChatThread>()
        for (const list of parts.values()) for (const t of list) byId.set(t.id, t)
        handlers.onThreads([...byId.values()].sort((a, b) => b.lastMessageAt - a.lastMessageAt))
      }
      const stops = queries.map((q, i) =>
        onSnapshot(
          q,
          (snap) => {
            parts.set(
              i,
              snap.docs.map((d) => toThread(d.id, d.data())),
            )
            emit()
          },
          (error) => console.warn("Live chat is unavailable:", error.code),
        ),
      )
      stops.push(
        onSnapshot(
          collection(db, "members", uid, "threadReads"),
          (snap) => handlers.onReads(Object.fromEntries(snap.docs.map((d) => [d.id, millis(d.get("lastReadAt"))]))),
          (error) => console.warn("Chat read markers are unavailable:", error.code),
        ),
      )
      return stops
    },
    handlers.onIdle,
  )
}

/** One thread's messages and its header, live. */
export function listenToThread(
  uid: string,
  threadId: string,
  handlers: {
    onThread: (thread: ChatThread | null) => void
    onMessages: (messages: ChatMessage[]) => void
    onIdle: () => void
  },
): () => void {
  return whileSignedIn(
    uid,
    () => {
      const db = clientDb()
      const ref = doc(db, "threads", threadId)
      return [
        onSnapshot(
          ref,
          (snap) => handlers.onThread(snap.exists() ? toThread(snap.id, snap.data()) : null),
          (error) => console.warn("Live chat is unavailable:", error.code),
        ),
        onSnapshot(
          query(collection(ref, "messages"), orderBy("createdAt"), limit(500)),
          (snap) => handlers.onMessages(snap.docs.map((d) => toMessage(d.id, d.data()))),
          (error) => console.warn("Live chat is unavailable:", error.code),
        ),
      ]
    },
    handlers.onIdle,
  )
}
