import "server-only"
import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { runClassSummary, type RecapServices } from "@/server/classes"
import { aiConfig, zoomApiConfig } from "@/lib/env.server"
import { adminBucket, adminDb, adminMessaging } from "@/lib/firebase/admin"

export const recapServices = (): RecapServices => ({
  files: adminBucket(),
  messaging: adminMessaging(),
  ai: aiConfig(),
  zoom: zoomApiConfig(),
})

/**
 * Queues the AI recap of a class. A Cloud Function picks it up; in local development without the
 * Functions emulator (DELIVER_ALERTS_INLINE=true) the web server does it after responding.
 */
export function queueRecap(recapId: string) {
  if (process.env.DELIVER_ALERTS_INLINE !== "true") return
  after(() => runClassSummary(adminDb(), recapServices(), recapId, `inline-${randomUUID()}`))
}
