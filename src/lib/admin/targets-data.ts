import "server-only"
import { todayInMarketZone } from "@/core/dates"
import type { StrikeTarget } from "@/core/domain/types"
import type { TargetGroupDef } from "@/core/parsers/strike-targets"
import { COLLECTIONS, REVISIONS, parseDoc, targetUpdateSchema, type TargetUpdate } from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"
import { getTargetGroups, listTargetUpdates, listTickers } from "@/lib/data/tools"
import type { EditorRow, EditorTicker } from "@/components/admin/targets-editor"

export async function editorContext(): Promise<{ configGroups: TargetGroupDef[]; tickers: EditorTicker[] }> {
  const [groups, tickers] = await Promise.all([getTargetGroups(), listTickers()])
  return {
    configGroups: groups.map((g) => ({ slug: g.slug, name: g.name, aliases: [g.shortName, ...g.aliases] })),
    tickers: tickers
      .filter((t) => t.kind === "stock")
      .map((t) => ({ symbol: t.symbol, lastClose: t.metrics?.lastClose ?? null, ch: t.channelSize, boc: t.bocSize })),
  }
}

/** The published update before a date (for "was" hints and the diff), uncached so edits are fresh. */
export async function previousUpdate(
  beforeOrOn: string,
  exclusive: boolean,
): Promise<{ effectiveDate: string; entries: StrikeTarget[] } | null> {
  const updates = await listTargetUpdates()
  const prev = updates.find((u) => (exclusive ? u.effectiveDate < beforeOrOn : u.effectiveDate <= beforeOrOn))
  return prev ? { effectiveDate: prev.effectiveDate, entries: prev.entries } : null
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

export function rowsFor(entries: StrikeTarget[]): EditorRow[] {
  let n = 0
  return entries.map((e) => ({
    key: `e${n++}`,
    group: e.group,
    symbol: e.symbol,
    target: String(e.target),
    breakLevel: String(e.breakLevel),
    putStrike: String(e.putStrike),
    expiry: e.expiry,
    dowWeight: e.dowWeight === null ? "" : String(e.dowWeight),
    note: e.note,
  }))
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

export const today = () => todayInMarketZone()
