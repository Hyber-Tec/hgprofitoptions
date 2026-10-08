"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { defaultAlertTitle } from "@/core/alerts"
import { isIsoDate } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import {
  AlertStateError,
  cancelAlert,
  closeAlert,
  deliverAlert,
  postFollowUp,
  publishAlert,
  readAlert,
  reviseAlert,
} from "@/server/alerts"
import { layout, sendEmail } from "@/server/email"
import { COLLECTIONS, type AlertDoc } from "@/server/model"
import { adminForAction, type Viewer } from "@/lib/auth/guards"
import { publicEnv } from "@/lib/env.public"
import { emailConfig } from "@/lib/env.server"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"
import { alertNotification } from "@/core/alerts"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const
const actor = (v: Viewer) => ({ uid: v.uid, email: v.email })

/**
 * In production a Cloud Function delivers notifications when an alert is published. Set
 * DELIVER_ALERTS_INLINE=true (local development without the Functions emulator) to send them from here.
 */
const inlineDelivery = process.env.DELIVER_ALERTS_INLINE === "true"

async function emailAlert(to: { email: string; fullName: string }[], alert: AlertDoc): Promise<number> {
  const config = emailConfig()
  if (!config) return 0
  const { title, body } = alertNotification(alert)
  const { html, text } = layout({
    heading: title,
    paragraphs: body.split("\n"),
    cta: {
      label: "Open the alert",
      href: `${publicEnv.NEXT_PUBLIC_SITE_URL}/members/alerts/${alert.parentId ?? alert.id}`,
    },
    footer:
      "You get these emails because you turned on email alerts. Change it in Settings, Notifications. Educational content, not personalized investment advice.",
  })
  let sent = 0
  for (const recipient of to) {
    await sendEmail(config, { to: recipient.email, subject: title, html, text })
      .then(() => sent++)
      .catch((error: unknown) => console.error("alert email", error))
  }
  return sent
}

function deliverLater(id: string) {
  if (!inlineDelivery) return
  after(async () => {
    try {
      await deliverAlert(adminDb(), adminMessaging(), id, { sendEmail: emailAlert })
    } catch (error) {
      console.error("deliverAlert", error)
    }
  })
}

const money = z.number().positive().max(1_000_000).nullable()

const draftInput = z
  .object({
    kind: z.enum(["buy", "sell", "update", "watch", "info"]),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z.]{0,5}$/, "Use a ticker like TSM")
      .nullable(),
    assetType: z.enum(["stock", "option"]).nullable(),
    optionRight: z.enum(["call", "put"]).nullable(),
    strike: money,
    expiry: z.string().nullable(),
    buyLow: money,
    buyHigh: money,
    sellPoints: z.array(z.number().positive().max(1_000_000)).max(3),
    stop: money,
    title: z.string().trim().max(140),
    body: z.string().max(5000),
    imagePath: z
      .string()
      .regex(/^alerts\/[\w.-]{1,120}$/)
      .nullable(),
    targetEntrySymbol: z.string().nullable(),
    sendEmail: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "info" && !v.symbol) ctx.addIssue({ code: "custom", path: ["symbol"], message: "Pick a ticker" })
    if (v.assetType === "option") {
      if (!v.optionRight) ctx.addIssue({ code: "custom", path: ["optionRight"], message: "Choose call or put" })
      if (v.strike === null) ctx.addIssue({ code: "custom", path: ["strike"], message: "Enter the strike" })
      if (!v.expiry || !isIsoDate(v.expiry))
        ctx.addIssue({ code: "custom", path: ["expiry"], message: "Pick the expiry" })
    }
    if (v.buyLow !== null && v.buyHigh !== null && v.buyHigh < v.buyLow)
      ctx.addIssue({ code: "custom", path: ["buyHigh"], message: "The top of the range is below the bottom" })
    if (v.kind === "info" && v.title.trim() === "")
      ctx.addIssue({ code: "custom", path: ["title"], message: "Give it a title" })
  })

export type AlertDraftInput = z.input<typeof draftInput>

/** Creates or updates a draft. Returns its id. */
export async function saveAlertDraft(input: AlertDraftInput, id: string | null): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = draftInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  const v = parsed.data
  const fields = {
    ...v,
    optionRight: v.assetType === "option" ? v.optionRight : null,
    strike: v.assetType === "option" ? v.strike : null,
    expiry: v.assetType === "option" ? v.expiry : null,
    title: v.title.trim() || defaultAlertTitle({ ...v, optionRight: v.assetType === "option" ? v.optionRight : null }),
  }
  const alerts = adminDb().collection(COLLECTIONS.alerts)
  if (id) {
    const current = await readAlert(adminDb(), id)
    if (!current) return { ok: false, code: "not-found", message: "This draft no longer exists." }
    if (current.status !== "draft" && current.status !== "scheduled")
      return { ok: false, code: "conflict", message: "This alert is already published. Use Edit to post a correction." }
    await alerts.doc(id).update(fields)
    refresh()
    return { ok: true, data: { id } }
  }
  const ref = alerts.doc()
  const now = Timestamp.now()
  await ref.set({
    ...fields,
    parentId: null,
    status: "draft",
    publishAt: null,
    publishedAt: null,
    closedAt: null,
    exits: [],
    resultPct: null,
    delivery: null,
    readCount: 0,
    tookCount: 0,
    edited: false,
    editedAt: null,
    revision: 1,
    createdBy: viewer.uid,
    createdAt: now,
  })
  return { ok: true, data: { id: ref.id } }
}

export async function publishAlertAction(id: string, publishAt: string | null): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const when = publishAt ? new Date(publishAt) : null
  if (when && Number.isNaN(when.getTime()))
    return { ok: false, code: "validation", message: "Pick a valid date and time." }
  try {
    await publishAlert(adminDb(), id, actor(viewer), when)
  } catch (error) {
    if (error instanceof AlertStateError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
  if (!when || when.getTime() <= Date.now() + 30_000) deliverLater(id)
  refresh()
  return { ok: true, data: undefined }
}

const reviseInput = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().max(5000),
  buyLow: money,
  buyHigh: money,
  sellPoints: z.array(z.number().positive().max(1_000_000)).max(3),
  stop: money,
  changeNote: z.string().trim().max(300).nullable(),
})

export async function reviseAlertAction(id: string, input: z.input<typeof reviseInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = reviseInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Check the fields." }
  try {
    await reviseAlert(adminDb(), id, { ...parsed.data, changeNote: parsed.data.changeNote || null }, actor(viewer))
  } catch (error) {
    if (error instanceof AlertStateError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
  refresh()
  return { ok: true, data: undefined }
}

const followUpInput = z.object({
  kind: z.enum(["sell", "update"]),
  body: z.string().trim().min(1, "Write the update").max(5000),
  price: money,
  portion: z.number().min(0).max(1).nullable(),
})

export async function postFollowUpAction(
  rootId: string,
  input: z.input<typeof followUpInput>,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = followUpInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  try {
    const id = await postFollowUp(adminDb(), rootId, parsed.data, actor(viewer))
    deliverLater(id)
    refresh()
    return { ok: true, data: { id } }
  } catch (error) {
    if (error instanceof AlertStateError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
}

const exitsInput = z
  .array(z.object({ price: z.number().min(0).max(1_000_000), portion: z.number().gt(0).max(1) }))
  .min(1)
  .max(5)

export async function closeAlertAction(id: string, exits: z.input<typeof exitsInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = exitsInput.safeParse(exits)
  if (!parsed.success) return { ok: false, code: "validation", message: "Enter each exit price and the portion sold." }
  try {
    await closeAlert(adminDb(), id, parsed.data, actor(viewer))
  } catch (error) {
    if (error instanceof AlertStateError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
  refresh()
  return { ok: true, data: undefined }
}

export async function cancelAlertAction(id: string): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  try {
    await cancelAlert(adminDb(), id, actor(viewer))
  } catch (error) {
    if (error instanceof AlertStateError) return { ok: false, code: "conflict", message: error.message }
    throw error
  }
  refresh()
  return { ok: true, data: undefined }
}
