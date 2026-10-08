import "server-only"
import type { QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore"
import {
  COLLECTIONS,
  MEMBER_SUBCOLLECTIONS,
  REVISIONS,
  alertReadSchema,
  alertSchema,
  parseDoc,
  type AlertDoc,
} from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

const alerts = () => adminDb().collection(COLLECTIONS.alerts)
const toAlerts = (docs: QueryDocumentSnapshot[]) =>
  docs.map((d) => parseDoc(alertSchema, d.id, d.data())).filter((a): a is AlertDoc => a !== null)

/** Alerts members can see (published or closed), newest first. Filters run in memory on the latest window. */
export async function listFeedAlerts(options: { limit?: number; window?: number } = {}): Promise<AlertDoc[]> {
  const snap = await alerts()
    .where("status", "in", ["published", "closed"])
    .orderBy("publishedAt", "desc")
    .limit(options.window ?? options.limit ?? 200)
    .get()
  const list = toAlerts(snap.docs)
  return options.limit ? list.slice(0, options.limit) : list
}

/** Every alert including drafts and scheduled ones, for the admin console. */
export async function listAllAlerts(limit = 300): Promise<AlertDoc[]> {
  const snap = await alerts().orderBy("createdAt", "desc").limit(limit).get()
  return toAlerts(snap.docs)
}

export async function getAlert(id: string): Promise<AlertDoc | null> {
  const snap = await alerts().doc(id).get()
  return snap.exists ? parseDoc(alertSchema, snap.id, snap.data()) : null
}

/** Follow-ups (sell, update) posted under an alert, oldest first. */
export async function listFollowUps(rootId: string): Promise<AlertDoc[]> {
  const snap = await alerts().where("parentId", "==", rootId).get()
  return toAlerts(snap.docs).sort(
    (a, b) => (a.publishedAt?.getTime() ?? a.createdAt.getTime()) - (b.publishedAt?.getTime() ?? b.createdAt.getTime()),
  )
}

export interface AlertRevision {
  id: string
  revision: number
  title: string
  body: string
  buyLow: number | null
  buyHigh: number | null
  sellPoints: number[]
  stop: number | null
  replacedAt: Date | null
  note: string | null
}

export async function listAlertRevisions(id: string): Promise<AlertRevision[]> {
  const snap = await alerts().doc(id).collection(REVISIONS).orderBy("revision", "desc").get()
  return snap.docs.flatMap((d) => {
    const parsed = alertSchema.safeParse(d.data())
    if (!parsed.success) return []
    const replacedAt = d.get("replacedAt") as Timestamp | undefined
    return [
      {
        id: d.id,
        revision: parsed.data.revision,
        title: parsed.data.title,
        body: parsed.data.body,
        buyLow: parsed.data.buyLow,
        buyHigh: parsed.data.buyHigh,
        sellPoints: parsed.data.sellPoints,
        stop: parsed.data.stop,
        replacedAt: replacedAt ? replacedAt.toDate() : null,
        note: (d.get("changeNote") as string | undefined) ?? null,
      },
    ]
  })
}

export interface ReadReceipt {
  readAt: Date
  took: boolean
}

export async function readReceipts(uid: string, alertIds: readonly string[]): Promise<Map<string, ReadReceipt>> {
  if (alertIds.length === 0) return new Map()
  const reads = adminDb().collection(COLLECTIONS.members).doc(uid).collection(MEMBER_SUBCOLLECTIONS.alertReads)
  const snaps = await adminDb().getAll(...alertIds.map((id) => reads.doc(id)))
  const map = new Map<string, ReadReceipt>()
  for (const snap of snaps) {
    if (!snap.exists) continue
    const parsed = alertReadSchema.safeParse(snap.data())
    if (parsed.success) map.set(snap.id, parsed.data)
  }
  return map
}

export interface AlertEngagement {
  /** Members who opened the alert. */
  reads: number
  /** Members who marked that they took the trade. */
  took: number
}

/** Opens and "took it" marks per alert by members (not admins), counted from read receipts. */
export async function alertEngagement(alertIds: readonly string[]): Promise<Map<string, AlertEngagement>> {
  const receipts = adminDb().collectionGroup(MEMBER_SUBCOLLECTIONS.alertReads).where("member", "==", true)
  const entries = await Promise.all(
    alertIds.map(async (id) => {
      const [reads, took] = await Promise.all([
        receipts.where("alertId", "==", id).count().get(),
        receipts.where("alertId", "==", id).where("took", "==", true).count().get(),
      ])
      return [id, { reads: reads.data().count, took: took.data().count }] as const
    }),
  )
  return new Map(entries)
}

/**
 * Unread among the latest 30 alerts, counting only alerts posted after the member joined, and when
 * they were counted: anything published later is not included.
 */
export async function countUnread(uid: string, since: Date): Promise<{ count: number; countedAt: number }> {
  const countedAt = Date.now()
  const latest = await listFeedAlerts({ limit: 30, window: 30 })
  const candidates = latest.filter((a) => (a.publishedAt?.getTime() ?? 0) > since.getTime())
  const receipts = await readReceipts(
    uid,
    candidates.map((a) => a.id),
  )
  return { count: candidates.filter((a) => !receipts.has(a.id)).length, countedAt }
}

/** Tickers with an open buy alert (for "HG alert" badges on tool tables). */
export async function openAlertSymbols(): Promise<Map<string, string>> {
  const snap = await alerts().where("status", "==", "published").get()
  const map = new Map<string, string>()
  for (const a of toAlerts(snap.docs))
    if (a.parentId === null && a.kind === "buy" && a.symbol && !map.has(a.symbol)) map.set(a.symbol, a.id)
  return map
}
