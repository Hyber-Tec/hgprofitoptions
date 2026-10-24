import { STOCK_TICKER } from "@/core/options"
import { getViewer } from "@/lib/auth/guards"
import { intradayBars } from "@/lib/data/quotes"
import { getTicker } from "@/lib/data/tools"

const NO_STORE = { "Cache-Control": "private, no-store" }

/** A stock's 5-minute bars over the last five sessions, for its 5-day chart: GET /members/stocks/TSM/intraday. */
export async function GET(_request: Request, { params }: RouteContext<"/members/stocks/[symbol]/intraday">) {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const symbol = decodeURIComponent((await params).symbol).toUpperCase()
  // Only the stocks the site follows, so the page cannot be used to look up anything else.
  if (!STOCK_TICKER.test(symbol) || !(await getTicker(symbol)))
    return Response.json({ error: "Unknown ticker." }, { status: 404, headers: NO_STORE })
  const result = await intradayBars(symbol)
  if (result === null) return Response.json({ available: false }, { headers: NO_STORE })
  return Response.json({ available: true, failed: result.failed, bars: result.bars }, { headers: NO_STORE })
}
