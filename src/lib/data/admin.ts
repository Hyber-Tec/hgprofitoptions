import "server-only"
import { COLLECTIONS, memberSchema, parseDoc, type Member } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

export async function listMembers(): Promise<Member[]> {
  const snap = await adminDb().collection(COLLECTIONS.members).get()
  return snap.docs
    .map((d) => {
      const parsed = parseDoc(memberSchema, d.id, d.data())
      return parsed ? { ...parsed, uid: d.id } : null
    })
    .filter((m): m is Member & { id: string } => m !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function listMembersForSearch(): Promise<{ uid: string; fullName: string; email: string }[]> {
  return (await listMembers()).map((m) => ({ uid: m.uid, fullName: m.fullName, email: m.email }))
}
