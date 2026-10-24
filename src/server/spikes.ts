/**
 * Spike lists: posting one (each stock's spike, with whether it has already traded back), and keeping
 * track of when each spike's stock trades back to its price as new sessions come in. Shared by the web
 * server and the daily market data job.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { spikeDirection, spikeRecovery, type SpikeRow } from "@/core/spikes"
import { COLLECTIONS, parseDoc, spikeSchema, tickerBarsSchema } from "./model"

async function barsOf(db: Firestore, symbols: readonly string[]): Promise<Map<string, DailyBar[]>> {
  const out = new Map<string, DailyBar[]>()
  const unique = [...new Set(symbols)]
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map((s) => db.collection(COLLECTIONS.tickerBars).doc(s))
    if (refs.length === 0) continue
    for (const snap of await db.getAll(...refs)) {
      const doc = snap.exists ? parseDoc(tickerBarsSchema, snap.id, snap.data()) : null
      if (doc) out.set(snap.id, doc.bars)
    }
  }
  return out
}

/** Posts a spike list: one post for the notification, one record per stock. Returns the post's id. */
export async function postSpikes(
  db: Firestore,
  input: { title: string; rows: readonly SpikeRow[]; notify: boolean; actorUid: string },
): Promise<string> {
  const bars = await barsOf(
    db,
    input.rows.map((r) => r.symbol),
  )
  const dates = input.rows.map((r) => r.date).sort()
  const main = dates[Math.floor(dates.length / 2)] ?? dates[0]
  const post = db.collection(COLLECTIONS.spikePosts).doc()
  const now = Timestamp.now()
  const batch = db.batch()
  batch.set(post, {
    title: input.title,
    date: main,
    count: input.rows.length,
    notify: input.notify,
    notifiedAt: null,
    postedAt: now,
    createdBy: input.actorUid,
  })
  for (const r of input.rows) {
    const direction = spikeDirection(r.price, r.close)
    const recovered = spikeRecovery(bars.get(r.symbol) ?? [], { date: r.date, price: r.price, direction })
    batch.set(db.collection(COLLECTIONS.spikes).doc(), {
      postId: post.id,
      line: r.line,
      symbol: r.symbol,
      price: r.price,
      date: r.date,
      at: r.at,
      time: r.time,
      close: r.close,
      direction,
      group: r.group,
      recoveredOn: recovered?.date ?? null,
      sessionsToRecover: recovered?.sessions ?? null,
      postedAt: now,
    })
  }
  await batch.commit()
  return post.id
}

/**
 * Marks the spikes whose stock has traded back to the spike price since, with the session it did and how
 * many sessions it took. Run after new bars are stored. Returns how many were marked.
 */
export async function trackSpikes(db: Firestore, through?: IsoDate): Promise<number> {
  const open = await db.collection(COLLECTIONS.spikes).where("recoveredOn", "==", null).get()
  const spikes = open.docs.map((d) => parseDoc(spikeSchema, d.id, d.data())).filter((s) => s !== null)
  if (spikes.length === 0) return 0
  const bars = await barsOf(
    db,
    spikes.map((s) => s.symbol),
  )
  let marked = 0
  const writer = db.bulkWriter()
  for (const s of spikes) {
    const series = (bars.get(s.symbol) ?? []).filter((b) => through === undefined || b.date <= through)
    const recovered = spikeRecovery(series, s)
    if (!recovered) continue
    void writer.update(db.collection(COLLECTIONS.spikes).doc(s.id), {
      recoveredOn: recovered.date,
      sessionsToRecover: recovered.sessions,
    })
    marked++
  }
  await writer.close()
  return marked
}
