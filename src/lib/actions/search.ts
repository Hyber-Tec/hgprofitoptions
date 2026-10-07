"use server"

import { formatInstrument } from "@/core/format"
import { alertInstrument } from "@/core/alerts"
import type { AlertKind } from "@/core/domain/types"
import { getViewer } from "@/lib/auth/guards"
import { listActiveTickers } from "@/lib/data/tools"
import { listFeedAlerts } from "@/lib/data/alerts"
import { listTrades } from "@/lib/data/journal"
import { listMembersForSearch } from "@/lib/data/admin"

export interface SearchIndex {
  tickers: { symbol: string; name: string | null }[]
  alerts: { id: string; kind: AlertKind; title: string }[]
  trades: { id: string; label: string; status: "open" | "closed" }[]
  members: { uid: string; fullName: string; email: string }[]
}

/** Data for the ⌘K palette, loaded the first time it opens. */
export async function getSearchIndex(): Promise<SearchIndex | null> {
  const viewer = await getViewer()
  if (!viewer) return null
  const [tickers, alerts, trades, members] = await Promise.all([
    viewer.hasAccess ? listActiveTickers() : Promise.resolve([]),
    viewer.hasAccess ? listFeedAlerts({ limit: 25 }) : Promise.resolve([]),
    listTrades(viewer.uid, { limit: 40 }),
    viewer.role === "admin" ? listMembersForSearch() : Promise.resolve([]),
  ])
  return {
    tickers: tickers.filter((t) => t.kind === "stock").map((t) => ({ symbol: t.symbol, name: t.name })),
    alerts: alerts.map((a) => ({ id: a.id, kind: a.kind, title: a.title })),
    trades: trades.map((t) => {
      const instrument = alertInstrument({
        symbol: t.symbol,
        assetType: t.assetType,
        optionRight: t.optionRight,
        strike: t.strike,
        expiry: t.expiry,
      })
      return { id: t.id, label: instrument ? formatInstrument(instrument) : t.symbol, status: t.status }
    }),
    members,
  }
}
