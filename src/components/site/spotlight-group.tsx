"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Tells each `.spotlight-card` inside where the pointer is, so borders near the pointer light up
 * (styles in globals.css). One listener for the whole group, at most one update per frame.
 * Inspired by Aceternity UI's "Glowing Effect".
 */
export function SpotlightGroup({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const group = ref.current
    if (!group) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        for (const card of group.querySelectorAll<HTMLElement>(".spotlight-card")) {
          const rect = card.getBoundingClientRect()
          card.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
          card.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
        }
      })
    }
    group.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      group.removeEventListener("pointermove", onMove)
    }
  }, [])

  return (
    <div ref={ref} className={cn("spotlight-group", className)}>
      {children}
    </div>
  )
}
