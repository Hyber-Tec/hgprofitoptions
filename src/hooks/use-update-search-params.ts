"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useTransition } from "react"

/** Updates URL search params in place (no scroll, no history entry) for filter controls. */
export function useUpdateSearchParams(): [(updates: Record<string, string | null>) => void, boolean] {
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
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
    },
    [router, pathname, params],
  )
  return [update, pending]
}
