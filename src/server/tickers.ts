/**
 * Adding a stock to the ticker list from its symbol alone, shared by the Tickers page and publishing strike
 * targets. With market data connected, the name and kind come from the provider and about 18 months of
 * prices are fetched at once, so the stock shows up in every tool right away.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { lastClosedSession } from "@/core/dates"
import { backfillTicker } from "./market/jobs"
import { fetchTickerDetails, type MarketDataConfig } from "./market/provider"
import { COLLECTIONS } from "./model"

export type AddTickerResult =
  | { status: "added"; name: string | null; bars: number; addedToWeek: string | null }
  | { status: "exists" }
  | { status: "not-found" }

/** Firestore's ALREADY_EXISTS, from `create` on a document that is there. */
const ALREADY_EXISTS = 6

export async function addTicker(
  db: Firestore,
  market: MarketDataConfig | null,
  symbol: string,
  channelSize: number | null,
  actorUid: string,
): Promise<AddTickerResult> {
  const ref = db.collection(COLLECTIONS.tickers).doc(symbol)
  if ((await ref.get()).exists) return { status: "exists" }

  let details: Awaited<ReturnType<typeof fetchTickerDetails>> = null
  if (market) {
    try {
      details = await fetchTickerDetails(market, symbol)
      if (!details) return { status: "not-found" }
    } catch (error) {
      console.error(`Ticker details for ${symbol}:`, error instanceof Error ? error.message : error)
    }
  }
  try {
    await ref.create({
      symbol,
      name: details?.name ?? null,
      kind: details?.kind ?? "stock",
      active: true,
      channelSize,
      // HG's usual BOC is half the channel.
      bocSize: channelSize === null ? null : Math.round((channelSize / 2) * 10000) / 10000,
      fsLevels: [],
      ssLevels: [],
      earningsStart: null,
      earningsEnd: null,
      earningsTiming: null,
      earningsNote: null,
      notes: null,
      categories: [],
      metrics: null,
      updatedAt: Timestamp.now(),
      updatedBy: actorUid,
    })
  } catch (error) {
    if ((error as { code?: number }).code === ALREADY_EXISTS) return { status: "exists" }
    throw error
  }

  let backfill = { bars: 0, addedToWeek: null as string | null }
  if (market) {
    try {
      backfill = await backfillTicker(db, market, symbol, lastClosedSession())
    } catch (error) {
      console.error(`Price history for ${symbol}:`, error instanceof Error ? error.message : error)
    }
  }
  return { status: "added", name: details?.name ?? null, ...backfill }
}
