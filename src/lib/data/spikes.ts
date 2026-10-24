import "server-only"
import { COLLECTIONS, parseDoc, spikePostSchema, spikeSchema, type SpikeDoc, type SpikePostDoc } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

export interface SpikeList extends SpikePostDoc {
  spikes: SpikeDoc[]
}

/** The latest spike lists, newest first, each with its stocks in the order they were posted. */
export async function listSpikeLists(limit = 20): Promise<SpikeList[]> {
  const posts = await adminDb().collection(COLLECTIONS.spikePosts).orderBy("postedAt", "desc").limit(limit).get()
  const lists = posts.docs
    .map((d) => parseDoc(spikePostSchema, d.id, d.data()))
    .filter((p): p is SpikePostDoc => p !== null)
  if (lists.length === 0) return []
  const ids = lists.map((p) => p.id)
  const spikes: SpikeDoc[] = []
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await adminDb()
      .collection(COLLECTIONS.spikes)
      .where("postId", "in", ids.slice(i, i + 30))
      .get()
    for (const d of snap.docs) {
      const spike = parseDoc(spikeSchema, d.id, d.data())
      if (spike) spikes.push(spike)
    }
  }
  const order = (s: SpikeDoc) => s.line
  return lists.map((p) => ({
    ...p,
    spikes: spikes.filter((s) => s.postId === p.id).sort((a, b) => order(a) - order(b)),
  }))
}

/** A stock's spikes, newest first. */
export async function listSpikesFor(symbol: string, limit = 10): Promise<SpikeDoc[]> {
  const snap = await adminDb()
    .collection(COLLECTIONS.spikes)
    .where("symbol", "==", symbol)
    .orderBy("date", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => parseDoc(spikeSchema, d.id, d.data())).filter((s): s is SpikeDoc => s !== null)
}
