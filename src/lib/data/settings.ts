import "server-only"
import { COLLECTIONS, memberSettingsSchema, type MemberSettings } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"
import { memo } from "./cache"

export function getMemberSettings(): Promise<MemberSettings> {
  return memo("settings:members", 60_000, async () => {
    const snap = await adminDb().collection(COLLECTIONS.settings).doc("members").get()
    const parsed = memberSettingsSchema.safeParse(snap.data() ?? {})
    return parsed.success ? parsed.data : memberSettingsSchema.parse({})
  })
}
