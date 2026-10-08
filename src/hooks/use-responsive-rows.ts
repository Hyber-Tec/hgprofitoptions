"use client"

import { useCallback, useDeferredValue, useSyncExternalStore } from "react"

/** Tailwind's breakpoints, where a list switches from cards to a table. */
const WIDE = { sm: "(min-width: 40rem)", md: "(min-width: 48rem)" } as const

/** Rows rendered by the server and during hydration, about a screenful in either layout. */
const FIRST_ROWS = 20

/**
 * For lists shown as a table on wider screens and as cards on phones, switched by CSS. Rendering every
 * row in both layouts made long tools slow to load and froze phones while they hydrated, so the server
 * and hydration render only the first rows of each layout. Right after, React renders the full list in
 * the background, so the page stays responsive, and only in the layout on screen.
 */
export function useResponsiveRows<T>(
  rows: readonly T[],
  breakpoint: keyof typeof WIDE,
): { table: readonly T[]; cards: readonly T[] } {
  const query = WIDE[breakpoint]
  const full = useDeferredValue(true, false)
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => {
        mql.removeEventListener("change", onChange)
      }
    },
    [query],
  )
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  )
  if (!full || wide === null) {
    const head = rows.slice(0, FIRST_ROWS)
    return { table: head, cards: head }
  }
  return wide ? { table: rows, cards: [] } : { table: [], cards: rows }
}
