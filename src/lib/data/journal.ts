import "server-only"
import {
  COLLECTIONS,
  MEMBER_SUBCOLLECTIONS,
  journalDaySchema,
  parseDoc,
  tradeSchema,
  type TradeDoc,
} from "@/server/model"
import { readTrades } from "@/server/portfolio"
import { adminDb } from "@/lib/firebase/admin"

export function listTrades(
  uid: string,
  options: { status?: "open" | "closed"; limit?: number } = {},
): Promise<TradeDoc[]> {
  return readTrades(adminDb(), uid, options)
}

export async function getTrade(uid: string, id: string): Promise<TradeDoc | null> {
  const snap = await adminDb()
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.trades)
    .doc(id)
    .get()
  return snap.exists ? parseDoc(tradeSchema, snap.id, snap.data()) : null
}

export interface JournalDay {
  date: string
  body: string
  mood: number | null
  updatedAt: Date
}

export async function listJournalDays(uid: string, limit = 60): Promise<JournalDay[]> {
  const snap = await adminDb()
    .collection(COLLECTIONS.members)
    .doc(uid)
    .collection(MEMBER_SUBCOLLECTIONS.journalDays)
    .orderBy("date", "desc")
    .limit(limit)
    .get()
  return snap.docs.flatMap((d) => {
    const parsed = journalDaySchema.safeParse(d.data())
    return parsed.success ? [{ ...parsed.data, date: d.id }] : []
  })
}
