import "server-only"
import {
  COLLECTIONS,
  parseDoc,
  presentationSchema,
  resourceSchema,
  type PresentationDoc,
  type ResourceDoc,
} from "@/server/model"
import { adminBucket, adminDb } from "@/lib/firebase/admin"

export async function listPresentations(
  options: { includeDrafts?: boolean; limit?: number } = {},
): Promise<PresentationDoc[]> {
  let query = adminDb().collection(COLLECTIONS.presentations).orderBy("sessionDate", "desc")
  if (!options.includeDrafts)
    query = adminDb()
      .collection(COLLECTIONS.presentations)
      .where("published", "==", true)
      .orderBy("sessionDate", "desc")
  if (options.limit) query = query.limit(options.limit)
  const snap = await query.get()
  return snap.docs
    .map((d) => parseDoc(presentationSchema, d.id, d.data()))
    .filter((p): p is PresentationDoc => p !== null)
}

export async function listResources(options: { includeDrafts?: boolean } = {}): Promise<ResourceDoc[]> {
  const snap = await adminDb().collection(COLLECTIONS.resources).get()
  return snap.docs
    .map((d) => parseDoc(resourceSchema, d.id, d.data()))
    .filter((r): r is ResourceDoc => r !== null && (options.includeDrafts === true || r.published))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title))
}

export async function getPresentation(id: string): Promise<PresentationDoc | null> {
  const snap = await adminDb().collection(COLLECTIONS.presentations).doc(id).get()
  return snap.exists ? parseDoc(presentationSchema, snap.id, snap.data()) : null
}

export async function getResource(id: string): Promise<ResourceDoc | null> {
  const snap = await adminDb().collection(COLLECTIONS.resources).doc(id).get()
  return snap.exists ? parseDoc(resourceSchema, snap.id, snap.data()) : null
}

/** Reads a stored file through the Admin SDK (the bucket itself is closed to clients). */
export async function readStoredFile(path: string): Promise<{ data: Buffer; contentType: string | null }> {
  const file = adminBucket().file(path)
  const [[data], [metadata]] = await Promise.all([file.download(), file.getMetadata()])
  return { data, contentType: metadata.contentType ?? null }
}
