/**
 * Brokerage linking and sync through SnapTrade (read-only), shared by the web app and the scheduled
 * Cloud Function. A sync refreshes connections, accounts, balances, holdings and today's snapshot,
 * stores new fills and rebuilds the member's brokerage trades (journal fields are preserved).
 */
import { createHash } from "node:crypto"
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { buildTrades, instrumentKey } from "@/core/calc/trades"
import { addDays, isIsoDate, isoDateInZone, todayInMarketZone } from "@/core/dates"
import type { Fill, Instrument } from "@/core/domain/types"
import { ACCOUNT_SUBCOLLECTIONS, COLLECTIONS, MEMBER_SUBCOLLECTIONS, alertReadSchema } from "../model"
import { computeMemberStats } from "../portfolio"
import { EMPTY_JOURNAL, closedTradeFields, openTradeFields } from "../trades"
import { open, seal } from "./secret-box"
import * as snap from "./snaptrade"

export interface BrokerageConfig extends snap.SnapTradeConfig {
  encryptionKey: string
}

export const CONSENT_VERSION = "2026-10"
export const CONSENT_TEXT =
  "Your linked accounts' positions, trades and performance will be visible to HG Profit Options admins for coaching. We never place trades. You can disconnect at any time."

const memberRef = (db: Firestore, uid: string) => db.collection(COLLECTIONS.members).doc(uid)
const shortHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 24)

/** The member's SnapTrade user, registering one on first use. */
export async function snapUser(db: Firestore, config: BrokerageConfig, uid: string): Promise<snap.SnapTradeUser> {
  const ref = db.collection(COLLECTIONS.snaptradeUsers).doc(uid)
  const existing = await ref.get()
  if (existing.exists) {
    const sealed = existing.get("userSecret") as string
    return { userId: existing.get("userId") as string, userSecret: open(sealed, config.encryptionKey) }
  }
  const registered = await snap.registerUser(config, `hg-${uid}`)
  await ref.set({
    userId: registered.userId,
    userSecret: seal(registered.userSecret, config.encryptionKey),
    createdAt: Timestamp.now(),
  })
  return registered
}

export async function connectionPortalUrl(
  db: Firestore,
  config: BrokerageConfig,
  uid: string,
  redirect: string,
  reconnectAuthorizationId?: string,
): Promise<string> {
  const u = await snapUser(db, config, uid)
  await memberRef(db, uid).update({
    brokerageConsent: { version: CONSENT_VERSION, text: CONSENT_TEXT, at: Timestamp.now() },
  })
  return snap.loginLink(config, u, redirect, reconnectAuthorizationId)
}

function activityInstrument(a: snap.SnapActivity): Instrument | null {
  const option = a.option_symbol
  if (option) {
    const symbol = option.underlying_symbol?.symbol ?? option.ticker?.trim().split(/\s+/)[0]
    const expiry = option.expiration_date?.slice(0, 10)
    const right = option.option_type?.toLowerCase().startsWith("p") ? "put" : "call"
    if (!symbol || !expiry || !isIsoDate(expiry) || option.strike_price == null) return null
    return { assetType: "option", symbol: symbol.toUpperCase(), right, strike: option.strike_price, expiry }
  }
  const symbol = a.symbol?.symbol
  return symbol ? { assetType: "stock", symbol: symbol.toUpperCase() } : null
}

const BUY = /^(BUY|BUY_TO_OPEN|BUY_TO_CLOSE|BTO|BTC)$/i
const SELL = /^(SELL|SELL_TO_OPEN|SELL_TO_CLOSE|STO|STC|OPTIONEXPIRATION|OPTIONASSIGNMENT)$/i
const FLOW_IN = /^(CONTRIBUTION|DEPOSIT|TRANSFER_IN)$/i
const FLOW_OUT = /^(WITHDRAWAL|TRANSFER_OUT)$/i

export interface SyncResult {
  accounts: number
  newFills: number
  trades: number
  status: "active" | "needs_reauth"
}

export async function syncMemberBrokerage(
  db: Firestore,
  config: BrokerageConfig,
  uid: string,
  options: { lookbackDays?: number } = {},
): Promise<SyncResult> {
  const u = await snapUser(db, config, uid)
  const now = Timestamp.now()
  const today = todayInMarketZone()
  const member = memberRef(db, uid)
  const memberSnap = await member.get()

  // Connections (authorizations).
  const authorizations = await snap.listAuthorizations(config, u)
  const existingConnections = await member.collection(MEMBER_SUBCOLLECTIONS.connections).get()
  const houseByAuth = new Map(existingConnections.docs.map((d) => [d.id, d.get("isHouse") === true]))
  const consent = memberSnap.get("brokerageConsent") as { version?: string; at?: Timestamp } | undefined
  for (const a of authorizations) {
    await member
      .collection(MEMBER_SUBCOLLECTIONS.connections)
      .doc(a.id)
      .set(
        {
          provider: "snaptrade",
          providerAuthId: a.id,
          brokerageName: a.brokerage?.name ?? "Brokerage",
          status: a.disabled ? "needs_reauth" : "active",
          isHouse: houseByAuth.get(a.id) ?? false,
          consentVersion: consent?.version ?? CONSENT_VERSION,
          consentedAt: consent?.at ?? now,
          lastSyncedAt: now,
          createdAt:
            (existingConnections.docs.find((d) => d.id === a.id)?.get("createdAt") as Timestamp | undefined) ?? now,
        },
        { merge: true },
      )
  }
  const needsReauth = authorizations.some((a) => a.disabled === true)

  // Accounts, balances, holdings and today's snapshot.
  const accounts = await snap.listAccounts(config, u)
  const lookback = options.lookbackDays ?? 90
  const activities =
    accounts.length > 0
      ? await snap.listActivities(config, u, {
          startDate: addDays(today, -lookback),
          endDate: today,
          accounts: accounts.map((a) => a.id),
        })
      : []
  let newFills = 0
  for (const account of accounts) {
    const accountRef = member.collection(MEMBER_SUBCOLLECTIONS.accounts).doc(account.id)
    const previous = await accountRef.get()
    const isHouse = houseByAuth.get(account.brokerage_authorization) ?? false
    const [positions, optionPositions, balances] = await Promise.all([
      snap.listPositions(config, u, account.id),
      snap.listOptionPositions(config, u, account.id).catch(() => []),
      snap.listBalances(config, u, account.id).catch(() => []),
    ])
    const total = account.balance?.total?.amount ?? null
    const cash = balances.reduce((s, b) => s + (b.cash ?? 0), 0)
    await accountRef.set(
      {
        connectionId: account.brokerage_authorization,
        providerAccountId: account.id,
        name: account.name ?? account.institution_name ?? null,
        numberMask: account.number ? account.number.slice(-4) : null,
        currency: account.balance?.total?.currency ?? "USD",
        included: previous.exists ? previous.get("included") !== false : true,
        isHouse,
        balance: { total, cash },
        lastSyncedAt: now,
      },
      { merge: true },
    )

    // Holdings: replace with the current positions, keeping when each one first appeared.
    const holdingsRef = accountRef.collection(ACCOUNT_SUBCOLLECTIONS.holdings)
    const previousHoldings = await holdingsRef.get()
    const firstSeen = new Map(
      previousHoldings.docs.map((d) => [d.id, (d.get("firstSeenAt") as Timestamp | undefined) ?? now]),
    )
    const current = new Map<string, Record<string, unknown>>()
    for (const p of positions) {
      const symbol = p.symbol?.symbol?.symbol
      if (!symbol || !p.units) continue
      const instrument: Instrument = { assetType: "stock", symbol: symbol.toUpperCase() }
      const key = instrumentKey(instrument)
      current.set(shortHash(key), {
        instrumentKey: key,
        symbol: instrument.symbol,
        assetType: "stock",
        optionRight: null,
        strike: null,
        expiry: null,
        quantity: p.units,
        avgCost: p.average_purchase_price ?? null,
        lastPrice: p.price ?? null,
        marketValue: p.price != null ? p.price * p.units : null,
        asOf: now,
      })
    }
    for (const o of optionPositions) {
      const os = o.symbol?.option_symbol
      const symbol = os?.underlying_symbol?.symbol
      const expiry = os?.expiration_date?.slice(0, 10)
      if (!os || !symbol || !expiry || !isIsoDate(expiry) || os.strike_price == null || !o.units) continue
      const instrument: Instrument = {
        assetType: "option",
        symbol: symbol.toUpperCase(),
        right: os.option_type?.toLowerCase().startsWith("p") ? "put" : "call",
        strike: os.strike_price,
        expiry,
      }
      const key = instrumentKey(instrument)
      current.set(shortHash(key), {
        instrumentKey: key,
        symbol: instrument.symbol,
        assetType: "option",
        optionRight: instrument.right,
        strike: instrument.strike,
        expiry,
        quantity: o.units,
        avgCost: o.average_purchase_price != null ? o.average_purchase_price / 100 : null,
        lastPrice: o.price ?? null,
        marketValue: o.price != null ? o.price * o.units * 100 : null,
        asOf: now,
      })
    }
    const batch = db.batch()
    for (const d of previousHoldings.docs) if (!current.has(d.id)) batch.delete(d.ref)
    for (const [id, data] of current) batch.set(holdingsRef.doc(id), { ...data, firstSeenAt: firstSeen.get(id) ?? now })

    // Today's snapshot, with deposits and withdrawals so returns stay time-weighted.
    const flows = activities
      .filter((a) => a.account?.id === account.id && a.trade_date?.slice(0, 10) === today)
      .reduce(
        (s, a) =>
          s +
          (FLOW_IN.test(a.type ?? "")
            ? Math.abs(a.amount ?? 0)
            : FLOW_OUT.test(a.type ?? "")
              ? -Math.abs(a.amount ?? 0)
              : 0),
        0,
      )
    if (total !== null)
      batch.set(accountRef.collection(ACCOUNT_SUBCOLLECTIONS.snapshots).doc(today), {
        date: today,
        value: total,
        cash,
        netFlow: flows,
      })

    // New fills from buys and sells.
    const fillsRef = accountRef.collection(ACCOUNT_SUBCOLLECTIONS.fills)
    for (const a of activities) {
      if (a.account?.id !== account.id || !a.units || a.price == null || !a.trade_date) continue
      const side = BUY.test(a.type ?? "") ? "buy" : SELL.test(a.type ?? "") ? "sell" : null
      const instrument = activityInstrument(a)
      if (!side || !instrument) continue
      batch.set(
        fillsRef.doc(a.id),
        {
          side,
          quantity: Math.abs(a.units),
          price: a.price,
          fees: Math.abs(a.fee ?? 0),
          executedAt: new Date(a.trade_date).toISOString(),
          instrument,
        },
        { merge: true },
      )
      newFills++
    }
    await batch.commit()
  }

  const trades = await rebuildBrokerTrades(db, uid)
  await member.update({
    brokerage: {
      linked: accounts.length > 0,
      status: needsReauth ? "needs_reauth" : accounts.length > 0 ? "active" : "none",
      lastSyncedAt: now,
    },
  })
  await computeMemberStats(db, uid, today)
  return { accounts: accounts.length, newFills, trades, status: needsReauth ? "needs_reauth" : "active" }
}

/** Rebuilds the member's brokerage trades from stored fills. Journal fields on existing trades are kept. */
export async function rebuildBrokerTrades(db: Firestore, uid: string): Promise<number> {
  const member = memberRef(db, uid)
  const accounts = await member.collection(MEMBER_SUBCOLLECTIONS.accounts).get()
  const fills: Fill[] = []
  for (const account of accounts.docs) {
    const snapFills = await account.ref.collection(ACCOUNT_SUBCOLLECTIONS.fills).get()
    for (const f of snapFills.docs) {
      const instrument = f.get("instrument") as Instrument
      fills.push({
        id: f.id,
        accountId: account.id,
        instrument,
        side: f.get("side") as "buy" | "sell",
        quantity: f.get("quantity") as number,
        price: f.get("price") as number,
        fees: (f.get("fees") as number | undefined) ?? 0,
        executedAt: f.get("executedAt") as string,
      })
    }
  }
  if (fills.length === 0) return 0
  const byId = new Map(fills.map((f) => [f.id, f]))
  const { closed, open: openPositions } = buildTrades(fills)
  const tradesRef = member.collection(MEMBER_SUBCOLLECTIONS.trades)
  const existing = await tradesRef.where("source", "==", "broker").get()
  const existingIds = new Set(existing.docs.map((d) => d.id))
  const reads = await member.collection(MEMBER_SUBCOLLECTIONS.alertReads).where("took", "==", true).get()
  const tookByKey = new Map<string, string>()
  for (const r of reads.docs) {
    const parsed = alertReadSchema.safeParse(r.data())
    if (parsed.success && parsed.data.tookInstrumentKey) tookByKey.set(parsed.data.tookInstrumentKey, r.id)
  }
  const now = Timestamp.now()
  const writer = db.bulkWriter()
  const seen = new Set<string>()
  const upsert = (id: string, fields: ReturnType<typeof closedTradeFields> | ReturnType<typeof openTradeFields>) => {
    seen.add(id)
    if (existingIds.has(id)) void writer.update(tradesRef.doc(id), { ...fields, updatedAt: now })
    else
      void writer.set(tradesRef.doc(id), {
        source: "broker",
        ...fields,
        ...EMPTY_JOURNAL,
        alertId: tookByKey.get(fields.instrumentKey) ?? null,
        createdAt: now,
        updatedAt: now,
      })
  }
  // A trade's identity is its account, instrument and first fill, so it survives later syncs.
  for (const t of closed)
    upsert(
      `b-${shortHash(`${t.accountId}|${t.instrumentKey}|${t.fillIds[0] ?? t.openedAt}`)}`,
      closedTradeFields(t, byId),
    )
  for (const p of openPositions)
    upsert(
      `b-${shortHash(`${p.accountId}|${p.instrumentKey}|${p.fillIds[0] ?? p.openedAt}`)}`,
      openTradeFields(p, byId),
    )
  for (const d of existing.docs) if (!seen.has(d.id)) void writer.delete(d.ref)
  await writer.close()
  return closed.length + openPositions.length
}

/** Removes a connection at SnapTrade and, unless kept, the synced data for its accounts. */
export async function disconnect(
  db: Firestore,
  config: BrokerageConfig,
  uid: string,
  connectionId: string,
  keepData: boolean,
): Promise<void> {
  const u = await snapUser(db, config, uid)
  await snap.removeAuthorization(config, u, connectionId).catch((error: unknown) => {
    if (!(error instanceof snap.SnapTradeError && error.status === 404)) throw error
  })
  const member = memberRef(db, uid)
  await member.collection(MEMBER_SUBCOLLECTIONS.connections).doc(connectionId).delete()
  if (!keepData) {
    const accounts = await member
      .collection(MEMBER_SUBCOLLECTIONS.accounts)
      .where("connectionId", "==", connectionId)
      .get()
    for (const a of accounts.docs) await db.recursiveDelete(a.ref)
    await rebuildBrokerTrades(db, uid)
  }
  const remaining = await member.collection(MEMBER_SUBCOLLECTIONS.connections).get()
  await member.update({
    brokerage: { linked: !remaining.empty, status: remaining.empty ? "none" : "active", lastSyncedAt: Timestamp.now() },
  })
  await computeMemberStats(db, uid, isoDateInZone(new Date()))
}

/** Deletes the member's SnapTrade user (used when the member is deleted). */
export async function forgetSnapUser(db: Firestore, config: BrokerageConfig, uid: string): Promise<void> {
  const ref = db.collection(COLLECTIONS.snaptradeUsers).doc(uid)
  const existing = await ref.get()
  if (!existing.exists) return
  await snap.deleteUser(config, existing.get("userId") as string).catch(() => undefined)
  await ref.delete()
}

/** The scheduled sync: every active member with a linked brokerage. One failure does not stop the rest. */
export async function syncAllBrokerages(
  db: Firestore,
  config: BrokerageConfig,
): Promise<{ synced: number; failed: number; needsReauth: number }> {
  const users = await db.collection(COLLECTIONS.snaptradeUsers).select().get()
  let synced = 0
  let failed = 0
  let needsReauth = 0
  for (const doc of users.docs) {
    const member = await memberRef(db, doc.id).get()
    if (!member.exists || member.get("status") !== "active") continue
    const connections = await memberRef(db, doc.id).collection(MEMBER_SUBCOLLECTIONS.connections).limit(1).get()
    if (connections.empty) continue
    try {
      const result = await syncMemberBrokerage(db, config, doc.id)
      synced++
      if (result.status === "needs_reauth") needsReauth++
    } catch (error) {
      failed++
      console.error(`Brokerage sync failed for ${doc.id}`, error)
    }
  }
  return { synced, failed, needsReauth }
}
