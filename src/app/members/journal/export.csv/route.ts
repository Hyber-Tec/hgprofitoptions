import { isoDateInZone } from "@/core/dates"
import { getViewer } from "@/lib/auth/guards"
import { listTrades } from "@/lib/data/journal"

const cell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The member's own journal as CSV (private notes are not included; they never leave the browser). */
export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return new Response("Not found", { status: 404 })
  const trades = await listTrades(viewer.uid)
  const header = [
    "opened",
    "closed",
    "symbol",
    "type",
    "right",
    "strike",
    "expiry",
    "direction",
    "status",
    "quantity",
    "avg_entry",
    "avg_exit",
    "realized_pnl",
    "return_pct",
    "fees",
    "source",
    "hg_alert",
    "setup",
    "tags",
    "rating",
    "emotions",
    "thesis",
    "plan",
    "outcome",
    "lesson",
  ]
  const lines = trades.map((t) =>
    [
      t.openedAt.toISOString(),
      t.closedAt?.toISOString() ?? "",
      t.symbol,
      t.assetType,
      t.optionRight ?? "",
      t.strike ?? "",
      t.expiry ?? "",
      t.direction,
      t.status,
      t.quantity,
      t.avgEntry,
      t.avgExit ?? "",
      t.realizedPnl ?? "",
      t.returnPct ?? "",
      t.fees,
      t.source,
      t.alertId ?? "",
      t.setup ?? "",
      t.tags.join(" "),
      t.rating ?? "",
      t.emotions.join(" "),
      t.thesis ?? "",
      t.plan ?? "",
      t.outcome ?? "",
      t.lesson ?? "",
    ]
      .map(cell)
      .join(","),
  )
  const body = [header.join(","), ...lines].join("\r\n")
  return new Response(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hg-journal-${isoDateInZone(new Date())}.csv"`,
      "Cache-Control": "private, no-store",
    },
  })
}
