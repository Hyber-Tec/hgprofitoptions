"use client"

import { useEffect, useState } from "react"
import type { LiveQuote } from "@/core/domain/types"

export interface LiveQuotesState {
  quotes: Record<string, LiveQuote>
  /** When the last answer arrived (epoch ms), or null before the first one. */
  receivedAt: number | null
}

const EMPTY: LiveQuotesState = { quotes: {}, receivedAt: null }

/**
 * Polls the server for live quotes while the page is visible. `enabled` is false when no market data
 * provider is set up, so pages without live prices make no requests.
 */
export function useLiveQuotes(
  tickers: readonly string[],
  { enabled, intervalMs = 15_000 }: { enabled: boolean; intervalMs?: number },
): LiveQuotesState {
  const key = [...new Set(tickers)].sort().join(",")
  const [state, setState] = useState<LiveQuotesState & { key: string }>({ ...EMPTY, key })

  useEffect(() => {
    if (!enabled || key === "") return
    let controller: AbortController | null = null
    let stopped = false
    const load = async () => {
      if (document.hidden || stopped) return
      controller?.abort()
      controller = new AbortController()
      try {
        const res = await fetch(`/members/quotes?t=${encodeURIComponent(key)}`, { signal: controller.signal })
        if (!res.ok) return
        const body = (await res.json()) as { available: boolean; quotes?: Record<string, LiveQuote> }
        if (!body.available) {
          stopped = true
          return
        }
        setState({ quotes: body.quotes ?? {}, receivedAt: Date.now(), key })
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("Live quotes:", error)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), intervalMs)
    const onVisible = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      controller?.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, key, intervalMs])

  // Quotes for a different set of tickers (a previous filter) are not shown.
  return state.key === key ? state : EMPTY
}
