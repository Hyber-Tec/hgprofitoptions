/**
 * Chat notifications: a new question goes to the advanced traders and admins, an answer to the person who
 * asked, and a follow-up to the advanced traders and admins already in the conversation.
 */
import type { Firestore } from "firebase-admin/firestore"
import type { Messaging } from "firebase-admin/messaging"
import { answersQuestions } from "@/core/levels"
import { COLLECTIONS, MESSAGES, memberSchema, parseDoc, threadMessageSchema, type Member } from "./model"
import { sendToMembers } from "./push"

async function readMembers(db: Firestore, uids: readonly string[]): Promise<Member[]> {
  if (uids.length === 0) return []
  const snaps = await db.getAll(...uids.map((uid) => db.collection(COLLECTIONS.members).doc(uid)))
  return snaps.flatMap((snap) => {
    const parsed = snap.exists ? parseDoc(memberSchema, snap.id, snap.data()) : null
    return parsed ? [{ ...parsed, uid: snap.id }] : []
  })
}

/** Advanced traders and admins who can open the chat right now. */
export async function chatStaff(db: Firestore, now = new Date()): Promise<Member[]> {
  const [admins, advanced] = await Promise.all([
    db.collection(COLLECTIONS.members).where("role", "==", "admin").get(),
    db.collection(COLLECTIONS.members).where("level", "==", "advanced").get(),
  ])
  const byUid = new Map<string, Member>()
  for (const doc of [...admins.docs, ...advanced.docs]) {
    const parsed = parseDoc(memberSchema, doc.id, doc.data())
    if (!parsed || parsed.status !== "active") continue
    const member: Member = { ...parsed, uid: doc.id }
    const inWindow = member.access !== null && member.access.from <= now && now < member.access.until
    if (member.role === "admin" || inWindow) byUid.set(doc.id, member)
  }
  return [...byUid.values()]
}

const firstName = (name: string) => name.split(/\s+/)[0] ?? name

export type ChatEvent =
  | { kind: "question"; threadId: string; askerUid: string; askerName: string; preview: string }
  | {
      kind: "reply"
      threadId: string
      askerUid: string
      author: { uid: string; name: string; role: Member["role"]; level: Member["level"] }
      preview: string
    }

/** Sends the browser notifications for one chat event. Returns how many devices were reached. */
export async function notifyChat(db: Firestore, messaging: Messaging, event: ChatEvent): Promise<number> {
  const url = `/members/chat/${event.threadId}`
  const tag = `chat-${event.threadId}`
  let recipients: Member[]
  let title: string
  if (event.kind === "question") {
    recipients = (await chatStaff(db)).filter((m) => m.uid !== event.askerUid)
    title = `New question from ${firstName(event.askerName)}`
  } else if (event.author.uid !== event.askerUid && answersQuestions(event.author)) {
    recipients = await readMembers(db, [event.askerUid])
    title = `${firstName(event.author.name)} answered your question`
  } else {
    // A follow-up from the asker: the advanced traders and admins already in the conversation, else all of them.
    const messages = await db.collection(COLLECTIONS.threads).doc(event.threadId).collection(MESSAGES).get()
    const helpers = new Set(
      messages.docs.flatMap((d) => {
        const m = parseDoc(threadMessageSchema, d.id, d.data())
        const helped =
          m && m.authorUid !== event.askerUid && answersQuestions({ role: m.authorRole, level: m.authorLevel })
        return helped ? [m.authorUid] : []
      }),
    )
    const staff = (await chatStaff(db)).filter((m) => m.uid !== event.author.uid)
    recipients = helpers.size > 0 ? staff.filter((m) => helpers.has(m.uid)) : staff
    title = `${firstName(event.author.name)} replied`
  }
  const uids = recipients.filter((m) => m.prefs.chat).map((m) => m.uid)
  if (uids.length === 0) return 0
  const result = await sendToMembers(db, messaging, uids, { title, body: event.preview, url, tag })
  return result.sent
}
