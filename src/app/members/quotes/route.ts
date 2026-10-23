import { OPTION_TICKER, STOCK_TICKER } from "@/core/options"
import { getViewer } from "@/lib/auth/guards"
import { liveQuotes } from "@/lib/data/quotes"

const NO_STORE = { "Cache-Control": "private, no-store" }

/** Live quotes for the tools: GET /members/quotes?t=TSM,O:TSM261106P00420000 (up to 250 tickers). */
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const raw = new URL(request.url).searchParams.get("t") ?? ""
  const tickers = [...new Set(raw.split(",").map((t) => t.trim().toUpperCase()))].filter((t) => t !== "")
  if (
    tickers.length === 0 ||
    tickers.length > 250 ||
    tickers.some((t) => !STOCK_TICKER.test(t) && !OPTION_TICKER.test(t))
  )
    return Response.json({ error: "Ask for 1 to 250 stock or option tickers." }, { status: 400, headers: NO_STORE })
  const quotes = await liveQuotes(tickers)
  if (quotes === null) return Response.json({ available: false }, { headers: NO_STORE })
  return Response.json({ available: true, quotes }, { headers: NO_STORE })
}
