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
