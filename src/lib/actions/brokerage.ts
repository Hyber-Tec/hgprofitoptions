"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { z } from "zod"
import type { ActionResult } from "@/core/domain/types"
import { COLLECTIONS, MEMBER_SUBCOLLECTIONS } from "@/server/model"
import { connectionPortalUrl, disconnect, syncMemberBrokerage } from "@/server/brokerage/sync"
import { getViewer } from "@/lib/auth/guards"
import { publicEnv } from "@/lib/env.public"
import { brokerageConfig } from "@/lib/env.server"
import { adminDb } from "@/lib/firebase/admin"

const unavailable = {
  ok: false,
  code: "unavailable",
  message: "Brokerage linking is not set up yet. HG will turn it on soon.",
} as const
const unauthorized = {
  ok: false,
  code: "unauthorized",
  message: "Your session has ended. Please sign in again.",
} as const
const REFRESH_EVERY_MS = 5 * 60 * 1000

/** Starts the SnapTrade Connection Portal (read-only). The member must have ticked the consent box. */
export async function startBrokerageConnection(input: {
  consent: boolean
  reconnectId?: string
}): Promise<ActionResult<{ url: string }>> {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return unauthorized
  const config = brokerageConfig()
  if (!config) return unavailable
  if (!input.consent)
    return {
      ok: false,
      code: "validation",
      message: "Please confirm that HG Profit Options admins may see your linked accounts.",
    }
  try {
    const url = await connectionPortalUrl(
      adminDb(),
      config,
      viewer.uid,
      `${publicEnv.NEXT_PUBLIC_SITE_URL}/members/portfolio?connected=1`,
      input.reconnectId,
    )
    return { ok: true, data: { url } }
  } catch (error) {
    console.error("startBrokerageConnection", error)
    return {
      ok: false,
      code: "unavailable",
      message: "The brokerage service did not respond. Please try again in a minute.",
    }
  }
}

/** Syncs now. Limited to once every 5 minutes per member. */
export async function refreshBrokerage(): Promise<ActionResult<{ accounts: number }>> {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return unauthorized
  const config = brokerageConfig()
  if (!config) return unavailable
  const last = viewer.member.brokerage.lastSyncedAt
  if (last && Date.now() - last.getTime() < REFRESH_EVERY_MS)
    return { ok: false, code: "conflict", message: "Synced moments ago. Try again in a few minutes." }
  try {
    const result = await syncMemberBrokerage(adminDb(), config, viewer.uid)
    refresh()
    return { ok: true, data: { accounts: result.accounts } }
  } catch (error) {
    console.error("refreshBrokerage", error)
    return {
      ok: false,
      code: "unavailable",
      message: "The sync did not finish. Your broker may need you to reconnect.",
    }
  }
}

export async function setAccountIncluded(accountId: string, included: boolean): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return unauthorized
  if (!z.string().min(1).max(200).safeParse(accountId).success)
    return { ok: false, code: "validation", message: "Invalid account." }
  const ref = adminDb()
    .collection(COLLECTIONS.members)
    .doc(viewer.uid)
    .collection(MEMBER_SUBCOLLECTIONS.accounts)
    .doc(accountId)
  if (!(await ref.get()).exists) return { ok: false, code: "not-found", message: "This account no longer exists." }
  await ref.update({ included, updatedAt: Timestamp.now() })
  refresh()
  return { ok: true, data: undefined }
}

export async function disconnectBrokerage(connectionId: string, keepData: boolean): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return unauthorized
  const config = brokerageConfig()
  if (!config) return unavailable
  try {
    await disconnect(adminDb(), config, viewer.uid, connectionId, keepData)
  } catch (error) {
    console.error("disconnectBrokerage", error)
    return { ok: false, code: "unavailable", message: "The brokerage could not be disconnected. Please try again." }
  }
  refresh()
  return { ok: true, data: undefined }
}
