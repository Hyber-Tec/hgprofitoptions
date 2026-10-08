"use server"

import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { z } from "zod"
import { alertInstrument } from "@/core/alerts"
import { instrumentKey } from "@/core/calc/trades"
import type { ActionResult } from "@/core/domain/types"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS } from "@/server/model"
import { activeMemberForAction } from "@/lib/auth/guards"
import { getAlert, listFeedAlerts } from "@/lib/data/alerts"
import { adminDb } from "@/lib/firebase/admin"

const memberRef = (uid: string) => adminDb().collection(COLLECTIONS.members).doc(uid)
/** gRPC status returned by create() when the document is already there. */
const ALREADY_EXISTS = 6
const unauthorized = {
  ok: false,
  code: "unauthorized",
  message: "Your session has ended. Please sign in again.",
} as const

/** Records that the member opened an alert. Called by the detail page after it renders. */
export async function markAlertRead(alertId: string): Promise<ActionResult> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  if (typeof alertId !== "string" || alertId.length === 0 || alertId.length > 128)
    return { ok: false, code: "validation", message: "Invalid alert." }
  const alert = await adminDb().collection(COLLECTIONS.alerts).doc(alertId).get()
  if (!alert.exists) return { ok: false, code: "not-found", message: "This alert is not available." }
  // Only the member's own receipt is written, so a burst of members opening a new alert never contends.
  const ref = memberRef(viewer.uid).collection(MEMBER_SUBCOLLECTIONS.alertReads).doc(alertId)
  const receipt = { alertId, member: viewer.role === "member", readAt: Timestamp.now(), took: false }
  await ref.create(receipt).catch((error: unknown) => {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error
  })
  return { ok: true, data: undefined }
}

export async function markAllAlertsRead(): Promise<ActionResult<{ marked: number }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const alerts = await listFeedAlerts({ window: 100 })
  const reads = memberRef(viewer.uid).collection(MEMBER_SUBCOLLECTIONS.alertReads)
  const existing = await adminDb().getAll(...alerts.map((a) => reads.doc(a.id)))
  const batch = adminDb().batch()
  let marked = 0
  for (const snap of existing) {
    if (snap.exists) continue
    batch.set(snap.ref, { alertId: snap.id, member: viewer.role === "member", readAt: Timestamp.now(), took: false })
    marked++
  }
  if (marked > 0) await batch.commit()
  refresh()
  return { ok: true, data: { marked } }
}

const tookInput = z.object({
  alertId: z.string().min(1).max(128),
  quantity: z.number().positive().max(1_000_000),
  price: z.number().positive().max(1_000_000),
})

/**
 * "I took this trade". Members without a linked brokerage get a prefilled open journal trade; with a
 * linked brokerage the synced trade is linked to the alert automatically, so only the intent is recorded.
 */
export async function tookAlertTrade(input: {
  alertId: string
  quantity: number
  price: number
}): Promise<ActionResult<{ tradeId: string | null }>> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const parsed = tookInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Enter a quantity and a price above zero." }
  const alert = await getAlert(parsed.data.alertId)
  if (!alert || (alert.status !== "published" && alert.status !== "closed"))
    return { ok: false, code: "not-found", message: "This alert is not available." }
  const instrument = alertInstrument(alert)
  if (!instrument)
    return { ok: false, code: "validation", message: "This alert is not about a specific stock or contract." }

  const db = adminDb()
  const readRef = memberRef(viewer.uid).collection(MEMBER_SUBCOLLECTIONS.alertReads).doc(alert.id)
  const tradesRef = memberRef(viewer.uid).collection(MEMBER_SUBCOLLECTIONS.trades)
  const linked = viewer.member.brokerage.linked
  const now = Timestamp.now()
  const key = instrumentKey(instrument)

  const tradeId = await db.runTransaction(async (tx) => {
    const read = await tx.get(readRef)
    // Recorded once: a second click (or another tab) must not add a second journal entry.
    if (read.exists && read.get("took") === true) return null
    let created: string | null = null
    if (!linked) {
      const ref = tradesRef.doc()
      created = ref.id
      tx.set(ref, {
        source: "manual",
        accountId: null,
        instrumentKey: key,
        symbol: instrument.symbol,
        assetType: instrument.assetType,
        optionRight: instrument.assetType === "option" ? instrument.right : null,
        strike: instrument.assetType === "option" ? instrument.strike : null,
        expiry: instrument.assetType === "option" ? instrument.expiry : null,
        direction: "long",
        status: "open",
        openedAt: now,
        closedAt: null,
        quantity: parsed.data.quantity,
        avgEntry: parsed.data.price,
        avgExit: null,
        realizedPnl: null,
        returnPct: null,
        fees: 0,
        alertId: alert.id,
        setup: null,
        tags: [],
        thesis: null,
        plan: null,
        outcome: null,
        lesson: null,
        emotions: [],
        rating: null,
        screenshots: [],
        fills: [
          {
            id: `${ref.id}-1`,
            side: "buy",
            quantity: parsed.data.quantity,
            price: parsed.data.price,
            fees: 0,
            executedAt: now.toDate().toISOString(),
          },
        ],
        createdAt: now,
        updatedAt: now,
      })
    }
    tx.set(readRef, {
      alertId: alert.id,
      member: viewer.role === "member",
      readAt: read.exists ? (read.get("readAt") as Timestamp) : now,
      took: true,
      tookInstrumentKey: key,
    })
    return created
  })
  refresh()
  return { ok: true, data: { tradeId } }
}

const symbolInput = z.string().regex(/^[A-Z][A-Z.]{0,9}$/)

/** Stops (or restarts) notifications for one ticker. */
export async function setTickerMuted(symbol: string, muted: boolean): Promise<ActionResult> {
  const viewer = await activeMemberForAction()
  if (!viewer) return unauthorized
  const parsed = symbolInput.safeParse(symbol)
  if (!parsed.success) return { ok: false, code: "validation", message: "Invalid ticker." }
  await memberRef(viewer.uid).update({
    "prefs.mutedSymbols": muted ? FieldValue.arrayUnion(parsed.data) : FieldValue.arrayRemove(parsed.data),
  })
  refresh()
  return { ok: true, data: undefined }
}
