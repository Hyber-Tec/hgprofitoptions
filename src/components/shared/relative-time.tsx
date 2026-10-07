"use client"

import { useSyncExternalStore } from "react"
import { formatDateTimeET, formatRelative } from "@/core/format"

let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => {
    now = Date.now()
    for (const l of listeners) l()
  }, 30_000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** "5 min ago", kept fresh while the page is open. The server renders the exact ET time instead. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const current = useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  )
  const date = new Date(iso)
  return (
    <time dateTime={iso} title={formatDateTimeET(date)} className={className} suppressHydrationWarning>
      {current === null ? formatDateTimeET(date) : formatRelative(date, new Date(current))}
    </time>
  )
}
