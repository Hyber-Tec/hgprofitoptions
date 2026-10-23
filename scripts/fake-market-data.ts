/**
 * A stand-in for the market data API, for local development and the end-to-end tests only. It answers the
 * endpoints the app uses (snapshots with bid and ask, daily bars, ticker details, splits) with made-up but
 * believable numbers around each ticker's last close in the emulators, so live prices and the order book
 * can be seen without a paid key.
 *
 *   pnpm market:fake                 # http://127.0.0.1:7655; then set in .env.local:
 *                                    #   MARKET_DATA_API_KEY=fake  MARKET_DATA_BASE_URL=http://127.0.0.1:7655
 *
 * Unknown symbols get a generated history; "ZZZZ" is never found (to test that path).
 */
import { createServer, type ServerResponse } from "node:http"
import { addDays, dayOfWeek, isIsoDate, isoDateInZone, todayInMarketZone, zonedStartOfDay } from "../src/core/dates"
import type { IsoDate } from "../src/core/domain/types"
import { initAdmin, option } from "./lib/admin"

const port = Number(option("port") ?? 7655)
const { db } = initAdmin()

const reference = new Map<string, number>()
async function loadReference() {
  const snap = await db.collection("tickers").get()
  for (const doc of snap.docs) {
    const close = doc.get("metrics.lastClose") as number | undefined
    if (typeof close === "number") reference.set(doc.id, close)
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967295
}

const NOT_FOUND = "ZZZZ"
const round = (n: number, step: number) => Number((Math.round(n / step) * step).toFixed(4))
const baseOf = (symbol: string) => reference.get(symbol) ?? round(20 + hash(symbol) * 280, 0.01)

/** A price that drifts gently through the day, so live pages visibly update. */
function livePrice(symbol: string, now = Date.now()): number {
  const base = baseOf(symbol)
  const wave =
    Math.sin(now / 45_000 + hash(symbol) * 10) * 0.004 + Math.sin(now / 7_000 + hash(`${symbol}2`) * 7) * 0.0012
  return round(base * (1 + wave), 0.01)
}

function marketStatus(now = new Date()): "open" | "closed" | "early_trading" | "late_trading" {
  const today = isoDateInZone(now)
  if (dayOfWeek(today) === 0 || dayOfWeek(today) === 6) return "closed"
  const minutes = (now.getTime() - zonedStartOfDay(today).getTime()) / 60_000
  if (minutes >= 240 && minutes < 570) return "early_trading"
  if (minutes >= 570 && minutes < 960) return "open"
  if (minutes >= 960 && minutes < 1200) return "late_trading"
  return "closed"
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

/** A Black-Scholes premium with 45% volatility: close enough to look like a real quote. */
function optionPremium(spot: number, strike: number, days: number, call: boolean): number {
  const t = Math.max(days, 0.5) / 365
  const vol = 0.45
  const d1 = (Math.log(spot / strike) + (vol * vol * t) / 2) / (vol * Math.sqrt(t))
  const d2 = d1 - vol * Math.sqrt(t)
  return call ? spot * normalCdf(d1) - strike * normalCdf(d2) : strike * normalCdf(-d2) - spot * normalCdf(-d1)
}

const OPTION = /^O:([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/

function snapshot(ticker: string) {
  const now = Date.now()
  const status = marketStatus()
  const nanos = now * 1e6
  const option = OPTION.exec(ticker)
  if (option) {
    const [, root = "", yy, mm, dd, right, thousandths] = option
    const underlying = [...reference.keys()].find((s) => s.replace(/\./g, "") === root) ?? root
    if (underlying === NOT_FOUND) return { ticker, error: "NOT_FOUND", message: "Ticker not found." }
    const expiry = `20${yy}-${mm}-${dd}` as IsoDate
    const strike = Number(thousandths) / 1000
    const days = (zonedStartOfDay(expiry).getTime() + 16 * 3_600_000 - now) / 86_400_000
    if (days < 0) return { ticker, error: "NOT_FOUND", message: "Ticker not found." }
    const mid = Math.max(0.01, optionPremium(livePrice(underlying, now), strike, days, right === "C"))
    const step = mid < 3 ? 0.01 : 0.05
    const half = Math.max(step, round(mid * 0.015, step))
    const bid = Math.max(0, round(mid - half, step))
    const ask = round(mid + half, step)
    return {
      ticker,
      type: "options",
      market_status: status,
      last_quote: {
        bid,
        ask,
        bid_size: 1 + Math.round(hash(`${ticker}b`) * 60),
        ask_size: 1 + Math.round(hash(`${ticker}a`) * 60),
        midpoint: round((bid + ask) / 2, 0.005),
        last_updated: nanos,
        timeframe: "DELAYED",
      },
      last_trade: { price: round(mid, step), sip_timestamp: nanos, timeframe: "DELAYED" },
      session: { close: round(mid, step), previous_close: round(mid * 0.97, step) },
    }
  }
  if (ticker === NOT_FOUND) return { ticker, error: "NOT_FOUND", message: "Ticker not found." }
  const price = livePrice(ticker, now)
  const spread = price < 20 ? 0.01 : 0.02
  return {
    ticker,
    type: "stocks",
    market_status: status,
    last_quote: {
      bid: round(price - spread, 0.01),
      ask: round(price + spread, 0.01),
      bid_size: 100 * (1 + Math.round(hash(`${ticker}b`) * 9)),
      ask_size: 100 * (1 + Math.round(hash(`${ticker}a`) * 9)),
      last_updated: nanos,
      timeframe: "DELAYED",
    },
    last_trade: { price, last_updated: nanos, timeframe: "DELAYED" },
    session: { close: price, previous_close: baseOf(ticker) },
  }
}

/** The strike spacing listed exchanges use around a price. */
const strikeStep = (price: number) => (price < 25 ? 0.5 : price < 500 ? 2.5 : 5)

/** An options chain snapshot page: a call and a put for every listed strike in the range. */
function chain(underlying: string, params: URLSearchParams) {
  const expiry = params.get("expiration_date") ?? ""
  const min = Number(params.get("strike_price.gte") ?? 0)
  const max = Number(params.get("strike_price.lte") ?? Number.POSITIVE_INFINITY)
  if (!isIsoDate(expiry) || underlying === NOT_FOUND) return []
  const spot = livePrice(underlying)
  const step = strikeStep(spot)
  const results = []
  for (let strike = Math.ceil(min / step) * step; strike <= max; strike = round(strike + step, 0.0001)) {
    for (const right of ["C", "P"] as const) {
      const ticker = `O:${underlying.replace(/\./g, "")}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}${right}${String(Math.round(strike * 1000)).padStart(8, "0")}`
      const quote = snapshot(ticker)
      if ("error" in quote) continue
      results.push({
        details: {
          contract_type: right === "C" ? "call" : "put",
          strike_price: strike,
          expiration_date: expiry,
          ticker,
        },
        last_quote: quote.last_quote,
        last_trade: quote.last_trade,
        day: { close: quote.session.close, volume: Math.round(hash(`${ticker}v`) * 4000) },
        open_interest: Math.round(hash(`${ticker}oi`) * 20000),
        underlying_asset: { price: spot, ticker: underlying },
      })
    }
  }
  return results
}

/** Weekday bars from `from` to `to`, ending near the ticker's reference price. */
function history(symbol: string, from: IsoDate, to: IsoDate) {
  const days: IsoDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayOfWeek(d) !== 0 && dayOfWeek(d) !== 6) days.push(d)
  let price = baseOf(symbol)
  const bars = []
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i] as IsoDate
    const r = hash(`${symbol}${day}`)
    const close = round(price, 0.01)
    const open = round(close * (1 + (r - 0.5) * 0.02), 0.01)
    bars.unshift({
      t: zonedStartOfDay(day).getTime(),
      o: open,
      h: round(Math.max(open, close) * (1 + r * 0.012), 0.01),
      l: round(Math.min(open, close) * (1 - (1 - r) * 0.012), 0.01),
      c: close,
      v: Math.round(1_000_000 + r * 9_000_000),
    })
    price = close / (1 + (hash(`${day}${symbol}`) - 0.5) * 0.03)
  }
  return bars
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
  if (url.pathname === "/health") return send(res, 200, { status: "OK" })
  if (!req.headers.authorization?.startsWith("Bearer ")) return send(res, 401, { status: "ERROR" })
  const path = url.pathname

  if (path === "/v3/snapshot") {
    const tickers = (url.searchParams.get("ticker.any_of") ?? "").split(",").filter(Boolean)
    return send(res, 200, { status: "OK", results: tickers.map(snapshot) })
  }
  const options = /^\/v3\/snapshot\/options\/([^/]+)$/.exec(path)
  if (options) {
    const results = chain(decodeURIComponent(options[1] ?? "").toUpperCase(), url.searchParams)
    return send(res, 200, { status: "OK", results })
  }
  const details = /^\/v3\/reference\/tickers\/([^/]+)$/.exec(path)
  if (details) {
    const symbol = decodeURIComponent(details[1] ?? "").toUpperCase()
    if (symbol === NOT_FOUND) return send(res, 404, { status: "NOT_FOUND" })
    return send(res, 200, { status: "OK", results: { ticker: symbol, name: `${symbol} Holdings Inc.`, type: "CS" } })
  }
  const range = /^\/v2\/aggs\/ticker\/([^/]+)\/range\/1\/day\/([\d-]+)\/([\d-]+)$/.exec(path)
  if (range) {
    const [, rawSymbol = "", from = "", to = ""] = range
    const symbol = decodeURIComponent(rawSymbol).toUpperCase()
    if (symbol === NOT_FOUND || !isIsoDate(from) || !isIsoDate(to)) return send(res, 200, { status: "OK", results: [] })
    const last = to >= todayInMarketZone() ? addDays(todayInMarketZone(), -1) : to
    return send(res, 200, { status: "OK", results: history(symbol, from, last) })
  }
  const grouped = /^\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/([\d-]+)$/.exec(path)
  if (grouped) {
    const date = grouped[1] ?? ""
    if (!isIsoDate(date) || dayOfWeek(date) === 0 || dayOfWeek(date) === 6) return send(res, 200, { results: [] })
    const results = [...reference.keys()].map((symbol) => {
      const [bar] = history(symbol, date, date)
      return { T: symbol, ...bar }
    })
    return send(res, 200, { status: "OK", resultsCount: results.length, results })
  }
  if (path === "/v3/reference/splits") return send(res, 200, { status: "OK", results: [] })
  return send(res, 404, { status: "NOT_FOUND", message: `No fake for ${path}` })
})

await loadReference()
setInterval(() => void loadReference(), 60_000).unref()
server.listen(port, "127.0.0.1", () => {
  console.log(`Fake market data on http://127.0.0.1:${port} (${reference.size} tickers with a last close)`)
})
