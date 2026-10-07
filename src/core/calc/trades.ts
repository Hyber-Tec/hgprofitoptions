import type { ClosedTrade, Fill, Instrument, IsoDate, OpenPosition } from "../domain/types"

export const CONTRACT_MULTIPLIER = { stock: 1, option: 100 } as const

export function multiplier(instrument: Instrument): number {
  return CONTRACT_MULTIPLIER[instrument.assetType]
}

/** "TSM" for stock, "TSM 2026-10-23 C 472.5" for an option contract. */
export function instrumentKey(instrument: Instrument): string {
  if (instrument.assetType === "stock") return instrument.symbol
  return `${instrument.symbol} ${instrument.expiry} ${instrument.right === "call" ? "C" : "P"} ${instrument.strike}`
}

/** The inverse of instrumentKey(); null when the key is not in that format. */
export function parseInstrumentKey(key: string): Instrument | null {
  const parts = key.trim().split(/\s+/)
  const [symbol, expiry, right, strike] = parts
  if (!symbol) return null
  if (parts.length === 1) return { assetType: "stock", symbol }
  if (
    parts.length !== 4 ||
    !expiry ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
    (right !== "C" && right !== "P") ||
    !strike ||
    !Number.isFinite(Number(strike))
  )
    return null
  return {
    assetType: "option",
    symbol,
    right: right === "C" ? "call" : "put",
    strike: Number(strike),
    expiry: expiry as IsoDate,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

interface Lot {
  fillId: string
  quantity: number
  price: number
}

interface TradeState {
  direction: "long" | "short"
  openedAt: string
  lots: Lot[]
  openedQty: number
  entryNotional: number
  matchedQty: number
  exitNotional: number
  grossPnl: number
  fees: number
  fillIds: string[]
}

function startTrade(fill: Fill, quantity: number, fees: number): TradeState {
  return {
    direction: fill.side === "buy" ? "long" : "short",
    openedAt: fill.executedAt,
    lots: [{ fillId: fill.id, quantity, price: fill.price }],
    openedQty: quantity,
    entryNotional: fill.price * quantity,
    matchedQty: 0,
    exitNotional: 0,
    grossPnl: 0,
    fees,
    fillIds: [fill.id],
  }
}

/**
 * Groups fills into trades per account and instrument, in time order.
 * A trade starts when the position leaves zero and ends when it returns to zero.
 * Closing quantity is matched to opening lots first-in, first-out.
 * A fill that flips the position (long to short or back) is split, with its fees shared pro rata.
 */
export function buildTrades(fills: readonly Fill[]): { closed: ClosedTrade[]; open: OpenPosition[] } {
  const groups = new Map<string, Fill[]>()
  for (const fill of fills) {
    if (!(fill.quantity > 0)) throw new RangeError(`Fill ${fill.id} has a non-positive quantity`)
    const key = `${fill.accountId}|${instrumentKey(fill.instrument)}`
    const list = groups.get(key)
    if (list) list.push(fill)
    else groups.set(key, [fill])
  }

  const closed: ClosedTrade[] = []
  const open: OpenPosition[] = []

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.executedAt.localeCompare(b.executedAt) || a.id.localeCompare(b.id))
    const first = sorted[0]
    if (!first) continue
    const mult = multiplier(first.instrument)
    let trade: TradeState | null = null

    for (const fill of sorted) {
      const fillDirection = fill.side === "buy" ? "long" : "short"
      if (trade === null) {
        trade = startTrade(fill, fill.quantity, fill.fees)
        continue
      }
      if (trade.direction === fillDirection) {
        trade.lots.push({ fillId: fill.id, quantity: fill.quantity, price: fill.price })
        trade.openedQty += fill.quantity
        trade.entryNotional += fill.price * fill.quantity
        trade.fees += fill.fees
        trade.fillIds.push(fill.id)
        continue
      }

      // Closing fill: match against open lots, first in first out.
      let remaining = fill.quantity
      const openQty = trade.lots.reduce((sum, lot) => sum + lot.quantity, 0)
      const closingQty = Math.min(remaining, openQty)
      const closingFees = fill.fees * (closingQty / fill.quantity)
      trade.fees += closingFees
      trade.fillIds.push(fill.id)

      while (remaining > 0 && trade.lots.length > 0) {
        const lot = trade.lots[0]
        if (!lot) break
        const matched = Math.min(lot.quantity, remaining)
        const perUnit = trade.direction === "long" ? fill.price - lot.price : lot.price - fill.price
        trade.grossPnl += perUnit * matched * mult
        trade.exitNotional += fill.price * matched
        trade.matchedQty += matched
        lot.quantity -= matched
        remaining -= matched
        if (lot.quantity <= 1e-9) trade.lots.shift()
      }

      if (trade.lots.length === 0) {
        const avgEntry = trade.entryNotional / trade.openedQty
        const realizedPnl = round2(trade.grossPnl - trade.fees)
        const costBasis = avgEntry * trade.openedQty * mult
        closed.push({
          accountId: fill.accountId,
          instrumentKey: instrumentKey(fill.instrument),
          instrument: fill.instrument,
          direction: trade.direction,
          openedAt: trade.openedAt,
          closedAt: fill.executedAt,
          quantity: trade.openedQty,
          avgEntry,
          avgExit: trade.exitNotional / trade.matchedQty,
          realizedPnl,
          returnPct: costBasis > 0 ? realizedPnl / costBasis : 0,
          fees: round2(trade.fees),
          fillIds: trade.fillIds,
        })
        trade = remaining > 1e-9 ? startTrade(fill, remaining, fill.fees - closingFees) : null
      }
    }

    if (trade !== null) {
      const openQty = trade.lots.reduce((sum, lot) => sum + lot.quantity, 0)
      const lotNotional = trade.lots.reduce((sum, lot) => sum + lot.price * lot.quantity, 0)
      open.push({
        accountId: first.accountId,
        instrumentKey: instrumentKey(first.instrument),
        instrument: first.instrument,
        direction: trade.direction,
        quantity: openQty,
        avgEntry: openQty > 0 ? lotNotional / openQty : 0,
        realizedSoFar: round2(trade.grossPnl - (trade.matchedQty > 0 ? trade.fees : 0)),
        openedAt: trade.openedAt,
        fillIds: trade.fillIds,
      })
    }
  }

  closed.sort((a, b) => a.closedAt.localeCompare(b.closedAt))
  return { closed, open }
}

/** A synthetic $0 closing fill for an option that expired worthless. */
export function expirationFill(
  position: Pick<OpenPosition, "accountId" | "instrument" | "direction" | "quantity">,
  expiry: IsoDate,
): Fill {
  return {
    id: `expire:${instrumentKey(position.instrument)}:${expiry}`,
    accountId: position.accountId,
    instrument: position.instrument,
    side: position.direction === "long" ? "sell" : "buy",
    quantity: position.quantity,
    price: 0,
    fees: 0,
    executedAt: `${expiry}T21:00:00.000Z`,
  }
}
