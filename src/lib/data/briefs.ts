import "server-only"
import { readBriefSettings } from "@/server/briefs"
import { COLLECTIONS, briefSchema, parseDoc, type BriefDoc, type BriefSettings } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

const briefs = () => adminDb().collection(COLLECTIONS.briefs)

/** Posted briefs, newest first. */
export async function listPublishedBriefs(limit = 40): Promise<BriefDoc[]> {
  const snap = await briefs().where("status", "==", "published").orderBy("publishedAt", "desc").limit(limit).get()
  return snap.docs.map((d) => parseDoc(briefSchema, d.id, d.data())).filter((b): b is BriefDoc => b !== null)
}

/** Every brief, drafts and scheduled ones included, for the admin console. */
export async function listAllBriefs(limit = 60): Promise<BriefDoc[]> {
  const snap = await briefs().orderBy("createdAt", "desc").limit(limit).get()
  return snap.docs.map((d) => parseDoc(briefSchema, d.id, d.data())).filter((b): b is BriefDoc => b !== null)
}

export async function getBrief(id: string): Promise<BriefDoc | null> {
  const snap = await briefs().doc(id).get()
  return snap.exists ? parseDoc(briefSchema, snap.id, snap.data()) : null
}

export function getBriefSettings(): Promise<BriefSettings> {
  return readBriefSettings(adminDb())
}
