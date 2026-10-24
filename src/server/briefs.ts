/**
 * The market brief: publishing briefs scheduled for later, and (when it is switched on) the AI writing
 * one at each of the brief's times on market days. Shared by the Cloud Functions and the web server.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { dueBriefTime } from "@/core/briefs"
import { addDays, todayInMarketZone, zonedDateTime } from "@/core/dates"
import { describeEarnings } from "@/core/earnings"
import { formatDateWithWeekday, formatLevel, formatMomentET, formatSigned } from "@/core/format"
import { INDEX_NAMES, INDEX_SYMBOLS } from "@/core/indices"
import { describeSpikeTime } from "@/core/spikes"
import { formatTimeIn } from "@/core/schedule"
import { writeMarketBrief, type AiConfig } from "./ai"
import {
  COLLECTIONS,
  briefSettingsSchema,
  parseDoc,
  spikeSchema,
  targetUpdateSchema,
  tickerSchema,
  weekSchema,
  type BriefSettings,
} from "./model"

const briefs = (db: Firestore) => db.collection(COLLECTIONS.briefs)

export async function readBriefSettings(db: Firestore): Promise<BriefSettings> {
  const snap = await db.collection(COLLECTIONS.settings).doc("brief").get()
  return briefSettingsSchema.parse(snap.data() ?? {})
}

/** Publishes the scheduled briefs whose time has come; returns their ids. */
export async function publishDueBriefs(db: Firestore, now: Date = new Date()): Promise<string[]> {
  const due = await briefs(db)
    .where("status", "==", "scheduled")
    .where("publishAt", "<=", Timestamp.fromDate(now))
    .get()
  const ids: string[] = []
  for (const doc of due.docs) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref)
      if (fresh.get("status") !== "scheduled") return
      const at = (fresh.get("publishAt") as Timestamp | null | undefined) ?? Timestamp.now()
      tx.update(doc.ref, { status: "published", publishedAt: at })
      ids.push(doc.id)
    })
  }
  return ids
}

/**
 * The site's data the AI writes the brief from, as plain text: the indexes' last weekly close, the
 * latest strike targets with each stock's last close and channel, the spikes not reached again yet, and
 * earnings in the next week.
 */
export async function briefData(db: Firestore, now: Date = new Date()): Promise<string> {
  const today = todayInMarketZone(now)
  const [weekSnap, targetsSnap, tickersSnap, spikesSnap] = await Promise.all([
    db.collection(COLLECTIONS.weeks).where("weekEnd", "<=", today).orderBy("weekEnd", "desc").limit(1).get(),
    db
      .collection(COLLECTIONS.targetUpdates)
      .where("status", "==", "published")
      .orderBy("effectiveDate", "desc")
      .limit(1)
      .get(),
    db.collection(COLLECTIONS.tickers).where("active", "==", true).get(),
    db.collection(COLLECTIONS.spikes).where("recoveredOn", "==", null).get(),
  ])
  const week = weekSnap.docs[0] ? parseDoc(weekSchema, weekSnap.docs[0].id, weekSnap.docs[0].data()) : null
  const targets = targetsSnap.docs[0]
    ? parseDoc(targetUpdateSchema, targetsSnap.docs[0].id, targetsSnap.docs[0].data())
    : null
  const tickers = new Map(
    tickersSnap.docs
      .map((d) => parseDoc(tickerSchema, d.id, d.data()))
      .filter((t) => t !== null)
      .map((t) => [t.symbol, t]),
  )
  const lines = [`Today is ${formatDateWithWeekday(today)} (New York).`]

  if (week) {
    lines.push("", `The indexes' last weekly close (week of ${week.weekStart} to ${week.weekEnd}):`)
    for (const symbol of INDEX_SYMBOLS) {
      const r = week.indices[symbol]
      if (!r) continue
      const when = (iso: string | null) => (iso ? ` (${formatMomentET(new Date(iso))})` : "")
      lines.push(
        `- ${INDEX_NAMES[symbol]}: close ${formatLevel(r.close)}, gap vs the Friday before ${formatSigned(r.close - r.pfcp)}, week high ${formatLevel(r.high)}${when(r.highAt)}, week low ${formatLevel(r.low)}${when(r.lowAt)}`,
      )
    }
  }

  if (targets) {
    lines.push("", `Strike Price Targets, update of ${targets.effectiveDate} (target, break of, put strike, expiry):`)
    for (const e of targets.entries) {
      const t = tickers.get(e.symbol)
      const close = t?.metrics ? `; last close ${formatLevel(t.metrics.lastClose)} on ${t.metrics.asOf}` : ""
      const channel = t?.channelSize ? `; channel ${String(t.channelSize)}, BOC ${String(t.bocSize ?? "")}` : ""
      lines.push(
        `- ${e.symbol} (${e.group}): target ${String(e.target)}, break of ${String(e.breakLevel)}, put ${String(e.putStrike)}, expires ${e.expiry}${close}${channel}`,
      )
    }
  }

  const spikes = spikesSnap.docs
    .map((d) => parseDoc(spikeSchema, d.id, d.data()))
    .filter((s) => s !== null && s.date >= addDays(today, -30))
    .sort((a, b) => (b?.date ?? "").localeCompare(a?.date ?? ""))
  if (spikes.length > 0) {
    lines.push("", "Spikes the price has not traded back to yet (spike price, when, that day's close):")
    for (const s of spikes)
      if (s)
        lines.push(
          `- ${s.symbol}: ${formatLevel(s.price)}, ${describeSpikeTime(s).toLowerCase()} ${s.date}${s.close !== null ? `, close ${formatLevel(s.close)}` : ""}`,
        )
  }

  const horizon = addDays(today, 7)
  const earnings = [...tickers.values()]
    .filter((t) => t.earningsStart && t.earningsStart <= horizon && (t.earningsEnd ?? t.earningsStart) >= today)
    .sort((a, b) => (a.earningsStart ?? "").localeCompare(b.earningsStart ?? ""))
  if (earnings.length > 0) {
    lines.push("", "Earnings in the next 7 days:")
    for (const t of earnings)
      lines.push(
        `- ${t.symbol}: ${describeEarnings(t.earningsStart, t.earningsEnd, t.earningsTiming, { long: true }) ?? ""}`,
      )
  }
  return lines.join("\n")
}

/**
 * At one of the brief's times on a market day, the AI writes the brief from the team's instructions and
 * posts it, once. Off (and null) until it is switched on with instructions. Returns the brief's id.
 */
export async function writeScheduledBrief(db: Firestore, ai: AiConfig | null, now: Date = new Date()) {
  const settings = await readBriefSettings(db)
  if (!ai || !settings.ai.enabled || settings.ai.instructions.trim() === "") return null
  const due = dueBriefTime(settings.times, now)
  if (!due) return null
  const slot = db.collection(COLLECTIONS.briefSlots).doc(`${due.date}-${due.time.replace(":", "")}`)
  try {
    await slot.create({ date: due.date, time: due.time, startedAt: Timestamp.now() })
  } catch {
    return null // Already written (or being written) for this time.
  }
  const moment = `${formatDateWithWeekday(due.date)}, ${formatTimeIn(zonedDateTime(due.date, due.time), "America/New_York")}`
  let written: { title: string; body: string }
  try {
    written = await writeMarketBrief(ai, {
      instructions: settings.ai.instructions,
      data: await briefData(db, now),
      moment,
    })
  } catch (error) {
    // The next run (five minutes later, still within this time's window) tries again.
    await slot.delete()
    throw error
  }
  const ref = briefs(db).doc()
  const at = Timestamp.now()
  await ref.set({
    title: written.title,
    body: written.body,
    status: "published",
    source: "ai",
    publishAt: null,
    publishedAt: at,
    notify: true,
    notifiedAt: null,
    createdAt: at,
    createdBy: null,
    updatedAt: at,
  })
  return ref.id
}

/** A draft the AI writes now, to try the instructions before switching the schedule on. */
export async function writeBriefDraft(db: Firestore, ai: AiConfig, instructions: string, actorUid: string) {
  const now = new Date()
  const moment = `${formatDateWithWeekday(todayInMarketZone(now))}, ${formatTimeIn(now, "America/New_York")}`
  const written = await writeMarketBrief(ai, { instructions, data: await briefData(db, now), moment })
  const ref = briefs(db).doc()
  const at = Timestamp.now()
  await ref.set({
    title: written.title,
    body: written.body,
    status: "draft",
    source: "ai",
    publishAt: null,
    publishedAt: null,
    notify: true,
    notifiedAt: null,
    createdAt: at,
    createdBy: actorUid,
    updatedAt: at,
  })
  return ref.id
}
