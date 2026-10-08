"use client"

import { useState, type ReactNode } from "react"
import { LuPause, LuPlay } from "react-icons/lu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Wraps auto-scrolling columns with the pause button that moving content must offer. Columns pause
 * through the `group-data-[paused]/marquee` variant.
 */
export function MarqueeFrame({ children, className }: { children: ReactNode; className?: string }) {
  const [paused, setPaused] = useState(false)
  return (
    <div className="flex flex-col items-center gap-6">
      <div data-paused={paused || undefined} className={cn("group/marquee w-full", className)}>
        {children}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full px-3 motion-reduce:hidden"
        aria-pressed={paused}
        onClick={() => setPaused((was) => !was)}
      >
        {paused ? <LuPlay data-icon="inline-start" /> : <LuPause data-icon="inline-start" />}
        {paused ? "Play" : "Pause"} testimonials
      </Button>
    </div>
  )
}
