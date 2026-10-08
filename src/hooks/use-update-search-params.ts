"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useTransition } from "react"

/**
 * Updates URL search params in place (no scroll, no history entry) for filter controls.
 *
 * With `clientOnly`, for filters the component applies by itself (the server renders the same page
 * whatever their value), only the address changes: Next.js keeps useSearchParams in sync with the
 * History API, so the component re-renders at once without asking the server for the page again.
 */
export function useUpdateSearchParams({ clientOnly = false }: { clientOnly?: boolean } = {}): [
  (updates: Record<string, string | null>) => void,
  boolean,
] {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const update = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      const query = next.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (clientOnly) window.history.replaceState(null, "", url)
      else startTransition(() => router.replace(url, { scroll: false }))
    },
    [router, pathname, params, clientOnly],
  )
  return [update, pending]
}
