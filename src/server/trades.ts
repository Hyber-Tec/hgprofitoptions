/**
 * Turning fills into journal trade documents, shared by manual entry, CSV import and brokerage sync.
 */
import { Timestamp } from "firebase-admin/firestore"
import { buildTrades, instrumentKey } from "@/core/calc/trades"
import type { ClosedTrade, Fill, Instrument, OpenPosition } from "@/core/domain/types"

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export function instrumentFields(instrument: Instrument) {
  return instrument.assetType === "option"
    ? {
        symbol: instrument.symbol,
        assetType: "option" as const,
        optionRight: instrument.right,
        strike: instrument.strike,
        expiry: instrument.expiry,
      }
    : { symbol: instrument.symbol, assetType: "stock" as const, optionRight: null, strike: null, expiry: null }
}

function fillsOf(ids: readonly string[], byId: Map<string, Fill>) {
  return ids.flatMap((id) => {
    const f = byId.get(id)
    return f
      ? [{ id: f.id, side: f.side, quantity: f.quantity, price: f.price, fees: f.fees, executedAt: f.executedAt }]
      : []
  })
}

/** Firestore fields for a closed trade (journal fields are left to the caller). */
export function closedTradeFields(t: ClosedTrade, byId: Map<string, Fill>) {
  return {
    accountId: t.accountId === "manual" ? null : t.accountId,
    instrumentKey: t.instrumentKey,
    ...instrumentFields(t.instrument),
    direction: t.direction,
    status: "closed" as const,
    openedAt: Timestamp.fromDate(new Date(t.openedAt)),
    closedAt: Timestamp.fromDate(new Date(t.closedAt)),
    quantity: t.quantity,
    avgEntry: round4(t.avgEntry),
    avgExit: round4(t.avgExit),
    realizedPnl: round2(t.realizedPnl),
    returnPct: round4(t.returnPct),
    fees: round2(t.fees),
    fills: fillsOf(t.fillIds, byId),
  }
}

/** Firestore fields for a position that is still open. Partial closes so far show as realized P&L. */
export function openTradeFields(p: OpenPosition, byId: Map<string, Fill>) {
  return {
    accountId: p.accountId === "manual" ? null : p.accountId,
    instrumentKey: p.instrumentKey,
    ...instrumentFields(p.instrument),
    direction: p.direction,
    status: "open" as const,
    openedAt: Timestamp.fromDate(new Date(p.openedAt)),
    closedAt: null,
    quantity: p.quantity,
    avgEntry: round4(p.avgEntry),
    avgExit: null,
    realizedPnl: p.realizedSoFar !== 0 ? round2(p.realizedSoFar) : null,
    returnPct: null,
    fees: 0,
    fills: fillsOf(p.fillIds, byId),
  }
}

export class TradeShapeError extends Error {}

/**
 * The fields of one journal trade from its fills (all for one instrument). A manual trade is a single
 * round trip, so fills that close it and open it again are rejected.
 */
export function tradeFieldsFromFills(fills: readonly Fill[]) {
  const byId = new Map(fills.map((f) => [f.id, f]))
  const { closed, open } = buildTrades(fills)
  if (closed.length + open.length !== 1)
    throw new TradeShapeError(
      "These fills make more than one trade. Close the trade before opening the same contract again.",
    )
  const [c] = closed
  if (c) return closedTradeFields(c, byId)
  const [o] = open
  if (o) return openTradeFields(o, byId)
  throw new TradeShapeError("No trade could be built from these fills.")
}

export const EMPTY_JOURNAL = {
  alertId: null,
  setup: null,
  tags: [] as string[],
  thesis: null,
  plan: null,
  outcome: null,
  lesson: null,
  emotions: [] as string[],
  rating: null,
  screenshots: [] as string[],
}

export { instrumentKey }
