import "server-only"
import type { Viewer } from "@/lib/auth/guards"
import { getSiteSettings } from "./public"

/**
 * How far HG's posts (alerts, strike targets, market briefs, spikes) reach for this viewer: null for
 * everything as it is posted, or, on a free trial, the moment before which posts are open to them.
 */
export async function postsCutoff(viewer: Viewer): Promise<Date | null> {
  if (viewer.fullAccess) return null
  const { trial } = await getSiteSettings()
  return new Date(Date.now() - trial.delayDays * 24 * 60 * 60 * 1000)
}

/** Whether a post published at `at` is open to a viewer with this cutoff. */
export function isOpen(cutoff: Date | null, at: Date | null): boolean {
  return cutoff === null || (at !== null && at.getTime() <= cutoff.getTime())
}

/** The day a held-back post opens on a free trial. */
export async function opensOn(at: Date | null): Promise<Date | null> {
  if (!at) return null
  const { trial } = await getSiteSettings()
  return new Date(at.getTime() + trial.delayDays * 24 * 60 * 60 * 1000)
}
