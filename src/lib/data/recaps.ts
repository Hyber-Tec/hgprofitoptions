import "server-only"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { COLLECTIONS, classRecapSchema, isDocId, parseDoc, type ClassRecapDoc } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

const recaps = () => adminDb().collection(COLLECTIONS.classRecaps)

const parseAll = (docs: QueryDocumentSnapshot[]) =>
  docs.map((d) => parseDoc(classRecapSchema, d.id, d.data())).filter((r): r is ClassRecapDoc => r !== null)

export async function getRecap(id: string): Promise<ClassRecapDoc | null> {
  if (!isDocId(id)) return null
  const snap = await recaps().doc(id).get()
  return snap.exists ? parseDoc(classRecapSchema, snap.id, snap.data()) : null
}

/** Every recap for admins, newest class first. */
export async function listRecaps(): Promise<ClassRecapDoc[]> {
  const snap = await recaps().orderBy("date", "desc").limit(200).get()
  return parseAll(snap.docs)
}

/** The recaps members can read, newest class first. */
export async function listPublishedRecaps(limit = 100): Promise<ClassRecapDoc[]> {
  const snap = await recaps().where("published", "==", true).orderBy("date", "desc").limit(limit).get()
  return parseAll(snap.docs).filter((r) => r.summary !== null)
}

/** A recap a member may read: published and written. */
export async function getPublishedRecap(id: string): Promise<ClassRecapDoc | null> {
  const recap = await getRecap(id)
  return recap?.published && recap.summary ? recap : null
}
