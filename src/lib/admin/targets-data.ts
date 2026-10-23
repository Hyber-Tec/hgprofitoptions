import "server-only"
import { todayInMarketZone } from "@/core/dates"
import type { IsoDate, StrikeTarget } from "@/core/domain/types"
import { targetsToText, type TargetGroupDef } from "@/core/parsers/strike-targets"
import { COLLECTIONS, REVISIONS, parseDoc, targetUpdateSchema, type TargetUpdate } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"
import { getTargetGroups, listTargetUpdates, listTickers } from "@/lib/data/tools"
import type { EditorTicker } from "@/components/admin/targets-editor"

export async function editorContext(): Promise<{ configGroups: TargetGroupDef[]; tickers: EditorTicker[] }> {
  const [groups, tickers] = await Promise.all([getTargetGroups(), listTickers()])
  return {
    configGroups: groups.map((g) => ({ slug: g.slug, name: g.name, aliases: [g.shortName, ...g.aliases] })),
    tickers: tickers
      .filter((t) => t.kind === "stock")
      .map((t) => ({ symbol: t.symbol, lastClose: t.metrics?.lastClose ?? null, ch: t.channelSize, boc: t.bocSize })),
  }
}

/** A published update the editor compares a new one with. */
export interface PublishedRef {
  effectiveDate: string
  entries: StrikeTarget[]
}

/**
 * The latest published updates, newest first, for the editor to compare with the one before whatever date
 * is being written (plus the one before `around` when it is older), and every published date.
 */
export async function publishedHistory(around?: string): Promise<{ recent: PublishedRef[]; dates: string[] }> {
  const updates = await listTargetUpdates()
  const recent = updates.slice(0, 12)
  const before = around ? updates.find((u) => u.effectiveDate < around) : undefined
  if (before && !recent.includes(before)) recent.push(before)
  return {
    recent: recent.map((u) => ({ effectiveDate: u.effectiveDate, entries: u.entries })),
    dates: updates.map((u) => u.effectiveDate),
  }
}

export async function listDrafts(): Promise<TargetUpdate[]> {
  const snap = await adminDb().collection(COLLECTIONS.targetUpdates).where("status", "==", "draft").get()
  return snap.docs.map((d) => parseDoc(targetUpdateSchema, d.id, d.data())).filter((u): u is TargetUpdate => u !== null)
}

export async function readUpdateDoc(
  id: string,
): Promise<(TargetUpdate & { groups: { slug: string; name: string }[] }) | null> {
  const snap = await adminDb().collection(COLLECTIONS.targetUpdates).doc(id).get()
  const parsed = snap.exists ? parseDoc(targetUpdateSchema, snap.id, snap.data()) : null
  if (!parsed) return null
  const groups = (snap.get("groups") as { slug: string; name: string }[] | undefined) ?? []
  return { ...parsed, groups }
}

export async function listRevisions(
  effectiveDate: string,
): Promise<{ revision: number; replacedAt: Date | null; changeNote: string | null; entries: number }[]> {
  const snap = await adminDb().collection(COLLECTIONS.targetUpdates).doc(effectiveDate).collection(REVISIONS).get()
  return snap.docs
    .map((d) => ({
      revision: (d.get("revision") as number | undefined) ?? Number(d.id),
      replacedAt: (d.get("replacedAt") as { toDate: () => Date } | undefined)?.toDate() ?? null,
      changeNote: (d.get("changeNote") as string | null | undefined) ?? null,
      entries: ((d.get("entries") as unknown[] | undefined) ?? []).length,
    }))
    .sort((a, b) => b.revision - a.revision)
}

export function groupsFor(
  entries: StrikeTarget[],
  known: TargetGroupDef[],
  extra: { slug: string; name: string }[] = [],
): { slug: string; name: string }[] {
  const slugs = [...new Set(entries.map((e) => e.group))]
  return slugs.map((slug) => ({
    slug,
    name: known.find((g) => g.slug === slug)?.name ?? extra.find((g) => g.slug === slug)?.name ?? slug,
  }))
}

/** An update written the way HG's Google Doc is, for the editor. */
export function textFor(
  effectiveDate: string,
  entries: StrikeTarget[],
  known: TargetGroupDef[],
  extra: { slug: string; name: string }[] = [],
): string {
  return targetsToText(
    effectiveDate as IsoDate,
    groupsFor(entries, known, extra).map((g) => ({ name: g.name, entries: entries.filter((e) => e.group === g.slug) })),
  )
}

export const today = () => todayInMarketZone()
