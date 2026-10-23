import type { IsoDate, OptionRight } from "./domain/types"

/**
 * The OCC-style option ticker the market data API uses: "O:" + root + YYMMDD + C or P + strike x 1000 in
 * 8 digits. TSM's $427.50 call expiring Nov 6, 2026 is O:TSM261106C00427500. Roots drop dots (BRK.B -> BRKB).
 */
export function optionTicker(symbol: string, right: OptionRight, strike: number, expiry: IsoDate): string {
  const root = symbol.toUpperCase().replace(/\./g, "")
  const date = `${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}`
  const thousandths = String(Math.round(strike * 1000)).padStart(8, "0")
  return `O:${root}${date}${right === "call" ? "C" : "P"}${thousandths}`
}

/** A stock ticker as typed in the tools ("TSM", "BRK.B"). */
export const STOCK_TICKER = /^[A-Z][A-Z.]{0,5}$/

/** An option ticker made by optionTicker. */
export const OPTION_TICKER = /^O:[A-Z]{1,6}\d{6}[CP]\d{8}$/
