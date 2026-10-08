"use server"

import { z } from "zod"
import type { ActionResult } from "@/core/domain/types"
import { deleteToken, saveToken, sendToMembers } from "@/server/push"
import { getViewer } from "@/lib/auth/guards"
import { readSession } from "@/lib/auth/session"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"

const tokenInput = z.object({ token: z.string().min(20).max(4096), userAgent: z.string().max(512).optional() })

export async function registerPushToken(input: { token: string; userAgent?: string }): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, code: "unauthorized", message: "Please sign in again." }
  const parsed = tokenInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: "This browser sent an invalid notification token." }
  const session = await readSession()
  await saveToken(adminDb(), viewer.uid, {
    token: parsed.data.token,
    userAgent: parsed.data.userAgent ?? null,
    sessionId: session?.sid ?? null,
  })
  return { ok: true, data: undefined }
}

export async function removePushToken(input: { token: string }): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, code: "unauthorized", message: "Please sign in again." }
  const parsed = tokenInput.pick({ token: true }).safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Invalid token." }
  await deleteToken(adminDb(), viewer.uid, parsed.data.token)
  return { ok: true, data: undefined }
}

export async function sendTestNotification(): Promise<ActionResult<{ sent: number }>> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, code: "unauthorized", message: "Please sign in again." }
  try {
    const result = await sendToMembers(adminDb(), adminMessaging(), [viewer.uid], {
      title: "Test from HG Profit Options",
      body: "Notifications work on this device. HG's alerts will arrive like this.",
      url: "/members/settings/notifications",
      tag: "hg-test",
    })
    if (result.queued === 0)
      return { ok: false, code: "not-found", message: "No device is registered yet. Turn notifications on first." }
    return { ok: true, data: { sent: result.sent } }
  } catch (error) {
    console.error("sendTestNotification", error)
    return { ok: false, code: "unavailable", message: "The notification service is not reachable right now." }
  }
}
