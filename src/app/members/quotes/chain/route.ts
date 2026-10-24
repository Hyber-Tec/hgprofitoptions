import { isIsoDate } from "@/core/dates"
import { STOCK_TICKER } from "@/core/options"
import { getViewer } from "@/lib/auth/guards"
import { optionChain } from "@/lib/data/quotes"

const NO_STORE = { "Cache-Control": "private, no-store" }

/** An options chain for the tools: GET /members/quotes/chain?symbol=TSM&expiry=2026-10-23&min=440&max=490 */
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const params = new URL(request.url).searchParams
  const symbol = (params.get("symbol") ?? "").trim().toUpperCase()
  const expiry = params.get("expiry") ?? ""
  const min = Number(params.get("min"))
  const max = Number(params.get("max"))
  // A cheap stock's put and target can be far apart; the chain is fetched a few pages at most either way.
  if (!STOCK_TICKER.test(symbol) || !isIsoDate(expiry) || !(min > 0) || !(max > min) || max > min * 5)
    return Response.json(
      { error: "Ask for a stock, an expiry and a strike range." },
      { status: 400, headers: NO_STORE },
    )
  const result = await optionChain({ symbol, expiry, minStrike: min, maxStrike: max })
  if (result === null) return Response.json({ available: false }, { headers: NO_STORE })
  return Response.json({ available: true, chain: result.chain, failed: result.failed }, { headers: NO_STORE })
}
