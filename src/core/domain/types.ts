/**
 * Domain types shared by the web app, Cloud Functions and scripts.
 * Pure TypeScript only: nothing in src/core may import React, Next.js or Firebase.
 */

export type Quarter = 1 | 2 | 3 | 4

/** "YYYY-MM-DD": a calendar date in America/New_York. */
export type IsoDate = string & { readonly __brand: "IsoDate" }

export type Role = "admin" | "member"
export type AccountStatus = "active" | "suspended"

export interface MembershipPeriod {
  id: string
  start: IsoDate
  /** Inclusive. */
  end: IsoDate
  kind: "quarterly" | "custom"
  /** "Q4 2026" or "Q4 2026 to Q1 2027". */
  label: string
  note?: string | null
}

export type MembershipStatus =
  | { kind: "admin" }
  | { kind: "suspended" }
  | { kind: "active"; period: MembershipPeriod; coverageEnd: IsoDate; daysLeft: number; expiringSoon: boolean }
  | { kind: "upcoming"; next: MembershipPeriod }
  | { kind: "expired"; last: MembershipPeriod }
  | { kind: "none" }

export interface DailyBar {
  date: IsoDate
  open: number | null
  high: number
  low: number
  close: number
  volume: number | null
}

export interface WeeklyStats {
  weekStart: IsoDate
  weekEnd: IsoDate
  pfcp: number
  high: number
  low: number
  close: number
  range: number
  svi: number
}

export interface ChannelSettings {
  ch: number
  boc: number
}

/** The latest quote for a stock or an option contract, real-time or 15 minutes delayed depending on the plan. */
export interface LiveQuote {
  /** "AAPL", or an option ticker such as "O:AAPL261106C00337500". */
  ticker: string
  last: number | null
  bid: number | null
  ask: number | null
  bidSize: number | null
  askSize: number | null
  previousClose: number | null
  /** Epoch milliseconds of the latest quote or trade. */
  updatedAt: number | null
  realTime: boolean
  marketStatus: "open" | "closed" | "early_trading" | "late_trading" | null
}

/** One side of a strike in an options chain. */
export interface ChainQuote {
  bid: number | null
  ask: number | null
  last: number | null
  volume: number | null
  openInterest: number | null
}

export interface ChainStrike {
  strike: number
  call: ChainQuote | null
  put: ChainQuote | null
}

/** The calls and puts of one expiry, for strikes in a range, as the provider's plan allows. */
export interface OptionChain {
  symbol: string
  expiry: IsoDate
  strikes: ChainStrike[]
  /** The stock's price as the provider reported it with the chain. */
  underlying: number | null
  realTime: boolean
  /** Epoch milliseconds of the newest quote or trade. */
  updatedAt: number | null
}

export interface StrikeTarget {
  group: string
  position: number
  symbol: string
  target: number
  breakLevel: number
  putStrike: number
  expiry: IsoDate
  dowWeight: number | null
  note: string | null
}

export type AssetType = "stock" | "option"
export type OptionRight = "call" | "put"

export type Instrument =
  | { assetType: "stock"; symbol: string }
  | { assetType: "option"; symbol: string; right: OptionRight; strike: number; expiry: IsoDate }

export type AlertKind = "buy" | "sell" | "update" | "watch" | "info"
export type AlertStatus = "draft" | "scheduled" | "published" | "closed" | "cancelled"

/** One execution from a brokerage, or a manual/CSV trade converted to fills. */
export interface Fill {
  id: string
  accountId: string
  instrument: Instrument
  side: "buy" | "sell"
  /** Shares or contracts, always positive. */
  quantity: number
  /** Per share, or per-contract premium (the x100 option multiplier is applied in calculations). */
  price: number
  fees: number
  /** ISO timestamp. */
  executedAt: string
}

export interface ClosedTrade {
  accountId: string
  instrumentKey: string
  instrument: Instrument
  direction: "long" | "short"
  openedAt: string
  closedAt: string
  quantity: number
  avgEntry: number
  avgExit: number
  /** After fees, multiplier applied. */
  realizedPnl: number
  /** realizedPnl / cost basis. */
  returnPct: number
  fees: number
  fillIds: string[]
}

export interface OpenPosition {
  accountId: string
  instrumentKey: string
  instrument: Instrument
  direction: "long" | "short"
  quantity: number
  /** Average price of the lots still open. */
  avgEntry: number
  /** Realized P&L from partial closes so far, after fees. */
  realizedSoFar: number
  openedAt: string
  fillIds: string[]
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false
      code: "unauthorized" | "forbidden" | "validation" | "conflict" | "not-found" | "unavailable" | "internal"
      message: string
      fieldErrors?: Record<string, string[]>
    }
