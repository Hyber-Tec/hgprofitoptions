/**
 * Publishing strike target updates, shared by the admin console and scripts.
 * One published document per effective date (its id is the date). A correction archives the
 * previous version under targetUpdates/{date}/revisions and increases `revision`.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import type { IsoDate, StrikeTarget } from "@/core/domain/types"
import { writeAudit } from "./members"
import { COLLECTIONS, REVISIONS, targetGroupsSchema } from "./model"

export interface PublishTargetsInput {
  effectiveDate: IsoDate
  entries: StrikeTarget[]
  sourceText: string | null
  changeNote: string | null
  /** Categories used by the entries; unknown ones are added to config/targetGroups. */
  groups: { slug: string; name: string }[]
  /** Whether members get a "new strike targets" notification (sent by a Cloud Function). */
  notify: boolean
}

export function updateTitle(date: IsoDate): string {
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  )
  return `Strike Price Targets Update ${label}`
}

export async function publishTargets(
  db: Firestore,
  input: PublishTargetsInput,
  actor: { uid: string; email: string | null },
): Promise<{ revision: number }> {
  const ref = db.collection(COLLECTIONS.targetUpdates).doc(input.effectiveDate)
  const configRef = db.collection(COLLECTIONS.config).doc("targetGroups")
  const revision = await db.runTransaction(async (tx) => {
    const [current, configSnap] = await Promise.all([tx.get(ref), tx.get(configRef)])
    const now = Timestamp.now()
    let next = 1
    if (current.exists && current.get("status") === "published") {
      const previous = (current.get("revision") as number | undefined) ?? 1
      tx.set(ref.collection(REVISIONS).doc(String(previous)), { ...current.data(), replacedAt: now })
      next = previous + 1
    }
    tx.set(ref, {
      effectiveDate: input.effectiveDate,
      title: updateTitle(input.effectiveDate),
      status: "published",
      entries: input.entries,
      sourceText: input.sourceText,
      changeNote: next > 1 ? input.changeNote : null,
      revisionOf: next > 1 ? input.effectiveDate : null,
      revision: next,
      notify: input.notify,
      publishedAt: now,
      publishedBy: actor.uid,
      createdAt: current.exists ? (current.get("createdAt") as Timestamp) : now,
      createdBy: current.exists ? ((current.get("createdBy") as string | null) ?? actor.uid) : actor.uid,
    })
    const config = targetGroupsSchema.safeParse(configSnap.data() ?? { groups: [] })
    const known = config.success ? config.data.groups : []
    const added = input.groups.filter((g) => !known.some((k) => k.slug === g.slug))
    if (added.length > 0) {
      const maxOrder = Math.max(0, ...known.map((k) => k.order))
      tx.set(configRef, {
        groups: [
          ...known,
          ...added.map((g, i) => ({
            slug: g.slug,
            name: g.name,
            shortName: g.name,
            description: null,
            order: maxOrder + i + 1,
            aliases: [],
          })),
        ],
      })
    }
    return next
  })
  await writeAudit(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: revision > 1 ? "targets.revised" : "targets.published",
    targetType: "targetUpdate",
    targetId: input.effectiveDate,
    detail: { entries: input.entries.length, revision },
  })
  return { revision }
}
