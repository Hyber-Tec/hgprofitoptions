import { isoDateInZone } from "@/core/dates"
import { getViewer } from "@/lib/auth/guards"
import { adminDb } from "@/lib/firebase/admin"
import { readAccounts, readHoldings, readSnapshots } from "@/server/portfolio"

const cell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Daily account values and current holdings for the member's linked accounts. */
export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return new Response("Not found", { status: 404 })
  const db = adminDb()
  const accounts = await readAccounts(db, viewer.uid)
  const lines = ["section,account,date,instrument,quantity,avg_cost,last_price,value,cash,net_flow"]
  for (const a of accounts) {
    const label = `${a.name ?? "Account"}${a.numberMask ? ` ${a.numberMask}` : ""}`
    for (const s of await readSnapshots(db, viewer.uid, a.id))
      lines.push(["value", label, s.date, "", "", "", "", s.value, s.cash ?? "", s.netFlow].map(cell).join(","))
    for (const h of await readHoldings(db, viewer.uid, a.id))
      lines.push(
        [
          "holding",
          label,
          isoDateInZone(h.asOf),
          h.instrumentKey,
          h.quantity,
          h.avgCost ?? "",
          h.lastPrice ?? "",
          h.marketValue ?? "",
          "",
          "",
        ]
          .map(cell)
          .join(","),
      )
  }
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hg-portfolio-${isoDateInZone(new Date())}.csv"`,
      "Cache-Control": "private, no-store",
    },
  })
}
