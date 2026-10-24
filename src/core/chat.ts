import type { Role } from "./domain/types"
import type { TraderLevel } from "./levels"

/** A chat thread as the pages show it (serializable; times in epoch milliseconds). */
export interface ChatThread {
  id: string
  askerUid: string
  askerName: string
  /** "class": every member with access reads it; "staff": only the asker, advanced traders and admins. */
  visibility: "class" | "staff"
  title: string
  status: "open" | "answered"
  createdAt: number
  lastMessageAt: number
  lastMessageBy: string
  lastMessagePreview: string
  messageCount: number
}

export interface ChatMessage {
  id: string
  authorUid: string
  authorName: string
  authorRole: Role
  authorLevel: TraderLevel
  body: string
  createdAt: number
  removed: boolean
}

/** Someone else wrote in the thread after the member last opened it. */
export function isUnread(thread: ChatThread, uid: string, reads: Readonly<Record<string, number>>): boolean {
  return thread.lastMessageBy !== uid && thread.lastMessageAt > (reads[thread.id] ?? 0)
}

/** The first non-empty line of a question, as its title (at most 120 characters). */
export function threadTitle(text: string): string {
  const line =
    text
      .split("\n")
      .find((l) => l.trim() !== "")
      ?.trim() ?? text.trim()
  return line.length > 120 ? `${line.slice(0, 117).trimEnd()}...` : line
}

/** One line of a message for lists and notifications (at most 140 characters). */
export function messagePreview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > 140 ? `${flat.slice(0, 137).trimEnd()}...` : flat
}
