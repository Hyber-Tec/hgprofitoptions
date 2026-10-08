"use client"

import { useLinkStatus } from "next/link"
import type { IconType } from "react-icons"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// Both indicators go inside a <Link> and appear only when its navigation still waits for the server
// after 150 ms, so quick navigations show nothing. Nothing is rendered or animated otherwise.

/** The link's icon, turning into a spinner while its page loads. */
export function LinkPendingIcon({ icon: Icon }: { icon: IconType }) {
  const { pending } = useLinkStatus()
  return (
    <span className="relative inline-flex size-4 shrink-0">
      <Icon className={cn(pending && "animate-out delay-150 fill-mode-forwards fade-out")} />
      {pending && (
        <span className="absolute inset-0 animate-in delay-150 fill-mode-both fade-in">
          <Spinner aria-hidden="true" />
        </span>
      )}
    </span>
  )
}

/** A pulsing underline for tab links (the link needs `relative`) while the tab loads. */
export function LinkPendingBar() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 animate-in delay-150 fill-mode-both fade-in"
    >
      <span className="block size-full animate-pulse bg-muted-foreground" />
    </span>
  )
}
