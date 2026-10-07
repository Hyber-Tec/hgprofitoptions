/**
 * A small, read-only SnapTrade API client (https://docs.snaptrade.com). Requests are signed with the
 * consumer key: HMAC-SHA256 over {"content","path","query"} (sorted keys, no spaces), base64.
 */
import { createHmac } from "node:crypto"
import { z } from "zod"

const BASE = "https://api.snaptrade.com"

export interface SnapTradeConfig {
  clientId: string
  consumerKey: string
}

export interface SnapTradeUser {
  userId: string
  userSecret: string
}

export class SnapTradeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

export function signRequest(consumerKey: string, path: string, query: string, content: unknown): string {
  const payload = JSON.stringify(sortKeys({ content: content ?? null, path, query }))
  return createHmac("sha256", consumerKey).update(payload).digest("base64")
}

async function call<T>(
  config: SnapTradeConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | undefined>,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const fullPath = `/api/v1${path}`
  const query = new URLSearchParams({ clientId: config.clientId, timestamp: String(Math.floor(Date.now() / 1000)) })
  for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, v)
  const queryString = query.toString()
  const response = await fetch(`${BASE}${fullPath}?${queryString}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Signature: signRequest(config.consumerKey, fullPath, queryString, body ?? null),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  if (!response.ok)
    throw new SnapTradeError(
      `SnapTrade ${method} ${path} failed (${response.status}): ${text.slice(0, 300)}`,
      response.status,
    )
  const json: unknown = text ? JSON.parse(text) : null
  return schema.parse(json)
}

const user = (u: SnapTradeUser) => ({ userId: u.userId, userSecret: u.userSecret })

// ---- Shapes (only the fields we use; everything else passes through) ------------------------

const money = z
  .object({ amount: z.number().nullable().optional(), currency: z.string().nullable().optional() })
  .loose()
  .nullable()
  .optional()

const accountSchema = z
  .object({
    id: z.string(),
    brokerage_authorization: z.string(),
    name: z.string().nullable().optional(),
    number: z.string().nullable().optional(),
    institution_name: z.string().nullable().optional(),
    balance: z.object({ total: money }).loose().nullable().optional(),
  })
  .loose()
export type SnapAccount = z.infer<typeof accountSchema>

const authorizationSchema = z
  .object({
    id: z.string(),
    disabled: z.boolean().nullable().optional(),
    brokerage: z
      .object({ name: z.string().nullable().optional(), slug: z.string().nullable().optional() })
      .loose()
      .nullable()
      .optional(),
  })
  .loose()
export type SnapAuthorization = z.infer<typeof authorizationSchema>

const positionSchema = z
  .object({
    symbol: z
      .object({ symbol: z.object({ symbol: z.string() }).loose().nullable().optional() })
      .loose()
      .nullable()
      .optional(),
    units: z.number().nullable().optional(),
    price: z.number().nullable().optional(),
    average_purchase_price: z.number().nullable().optional(),
  })
  .loose()
export type SnapPosition = z.infer<typeof positionSchema>

const optionPositionSchema = z
  .object({
    symbol: z
      .object({
        option_symbol: z
          .object({
            ticker: z.string().nullable().optional(),
            option_type: z.string().nullable().optional(),
            strike_price: z.number().nullable().optional(),
            expiration_date: z.string().nullable().optional(),
            underlying_symbol: z.object({ symbol: z.string().nullable().optional() }).loose().nullable().optional(),
          })
          .loose(),
      })
      .loose()
      .nullable()
      .optional(),
    units: z.number().nullable().optional(),
    price: z.number().nullable().optional(),
    average_purchase_price: z.number().nullable().optional(),
  })
  .loose()
export type SnapOptionPosition = z.infer<typeof optionPositionSchema>

const balanceSchema = z
  .object({
    currency: z.object({ code: z.string().nullable().optional() }).loose().nullable().optional(),
    cash: z.number().nullable().optional(),
  })
  .loose()

const activitySchema = z
  .object({
    id: z.string(),
    account: z.object({ id: z.string() }).loose().nullable().optional(),
    type: z.string().nullable().optional(),
    units: z.number().nullable().optional(),
    price: z.number().nullable().optional(),
    fee: z.number().nullable().optional(),
    amount: z.number().nullable().optional(),
    trade_date: z.string().nullable().optional(),
    symbol: z.object({ symbol: z.string().nullable().optional() }).loose().nullable().optional(),
    option_symbol: z
      .object({
        ticker: z.string().nullable().optional(),
        option_type: z.string().nullable().optional(),
        strike_price: z.number().nullable().optional(),
        expiration_date: z.string().nullable().optional(),
        underlying_symbol: z.object({ symbol: z.string().nullable().optional() }).loose().nullable().optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose()
export type SnapActivity = z.infer<typeof activitySchema>

// ---- Calls ------------------------------------------------------------------------------------

export function registerUser(config: SnapTradeConfig, userId: string): Promise<SnapTradeUser> {
  return call(
    config,
    "POST",
    "/snapTrade/registerUser",
    {},
    { userId },
    z.object({ userId: z.string(), userSecret: z.string() }).loose(),
  ).then((r) => ({ userId: r.userId, userSecret: r.userSecret }))
}

export function deleteUser(config: SnapTradeConfig, userId: string): Promise<unknown> {
  return call(config, "DELETE", "/snapTrade/deleteUser", { userId }, undefined, z.unknown())
}

/** A one-time link to the SnapTrade Connection Portal, read-only access. */
export function loginLink(
  config: SnapTradeConfig,
  u: SnapTradeUser,
  redirect: string,
  reconnect?: string,
): Promise<string> {
  return call(
    config,
    "POST",
    "/snapTrade/login",
    user(u),
    { customRedirect: redirect, connectionType: "read", immediateRedirect: true, ...(reconnect ? { reconnect } : {}) },
    z.object({ redirectURI: z.string() }).loose(),
  ).then((r) => r.redirectURI)
}

export function listAuthorizations(config: SnapTradeConfig, u: SnapTradeUser): Promise<SnapAuthorization[]> {
  return call(config, "GET", "/authorizations", user(u), undefined, z.array(authorizationSchema))
}

export function removeAuthorization(
  config: SnapTradeConfig,
  u: SnapTradeUser,
  authorizationId: string,
): Promise<unknown> {
  return call(
    config,
    "DELETE",
    `/authorizations/${encodeURIComponent(authorizationId)}`,
    user(u),
    undefined,
    z.unknown(),
  )
}

export function listAccounts(config: SnapTradeConfig, u: SnapTradeUser): Promise<SnapAccount[]> {
  return call(config, "GET", "/accounts", user(u), undefined, z.array(accountSchema))
}

export function listPositions(config: SnapTradeConfig, u: SnapTradeUser, accountId: string): Promise<SnapPosition[]> {
  return call(
    config,
    "GET",
    `/accounts/${encodeURIComponent(accountId)}/positions`,
    user(u),
    undefined,
    z.array(positionSchema),
  )
}

export function listOptionPositions(
  config: SnapTradeConfig,
  u: SnapTradeUser,
  accountId: string,
): Promise<SnapOptionPosition[]> {
  return call(
    config,
    "GET",
    `/accounts/${encodeURIComponent(accountId)}/options`,
    user(u),
    undefined,
    z.array(optionPositionSchema),
  )
}

export function listBalances(
  config: SnapTradeConfig,
  u: SnapTradeUser,
  accountId: string,
): Promise<z.infer<typeof balanceSchema>[]> {
  return call(
    config,
    "GET",
    `/accounts/${encodeURIComponent(accountId)}/balances`,
    user(u),
    undefined,
    z.array(balanceSchema),
  )
}

export function listActivities(
  config: SnapTradeConfig,
  u: SnapTradeUser,
  options: { startDate: string; endDate: string; accounts?: string[] },
): Promise<SnapActivity[]> {
  return call(
    config,
    "GET",
    "/activities",
    { ...user(u), startDate: options.startDate, endDate: options.endDate, accounts: options.accounts?.join(",") },
    undefined,
    z.array(activitySchema),
  )
}
