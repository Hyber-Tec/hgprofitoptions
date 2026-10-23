"use client"

import { useEffect, useState } from "react"
import type { IsoDate, OptionChain } from "@/core/domain/types"

export interface OptionChainState {
  chain: OptionChain | null
  /** True once the first answer arrived. */
  loaded: boolean
}

const EMPTY: OptionChainState = { chain: null, loaded: false }

/** Polls the options chain for one expiry and strike range while it is open and the page is visible. */
export function useOptionChain(
  request: { symbol: string; expiry: IsoDate; minStrike: number; maxStrike: number } | null,
  { enabled, intervalMs = 15_000 }: { enabled: boolean; intervalMs?: number },
): OptionChainState {
  const key = request
    ? new URLSearchParams({
        symbol: request.symbol,
        expiry: request.expiry,
        min: request.minStrike.toFixed(2),
        max: request.maxStrike.toFixed(2),
      }).toString()
    : ""
  const [state, setState] = useState<OptionChainState & { key: string }>({ ...EMPTY, key })

  useEffect(() => {
    if (!enabled || key === "") return
    let controller: AbortController | null = null
    let stopped = false
    const load = async () => {
      if (document.hidden || stopped) return
      controller?.abort()
      controller = new AbortController()
      try {
        const res = await fetch(`/members/quotes/chain?${key}`, { signal: controller.signal })
        if (!res.ok) return
        const body = (await res.json()) as { available: boolean; chain?: OptionChain | null }
        if (!body.available) {
          stopped = true
          return
        }
        setState({ chain: body.chain ?? null, loaded: true, key })
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("Options chain:", error)
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

  return state.key === key ? state : EMPTY
}
