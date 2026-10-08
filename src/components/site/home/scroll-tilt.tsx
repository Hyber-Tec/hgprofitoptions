"use client"

import { m, useReducedMotion, useScroll, useTransform } from "motion/react"
import { useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * A device-like frame that starts tilted back and settles flat as it scrolls into view. Adapted from
 * Aceternity UI's "Container Scroll Animation"; the frame stays flat for reduced motion.
 */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.25"] })
  const rotateX = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [26, 0])
  const scale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1.06, 1])
  const glow = useTransform(scrollYProgress, [0.3, 1], [0, 1])

  return (
    <div ref={ref} className={cn("relative perspective-[1400px]", className)}>
      <m.div
        aria-hidden
        style={{ opacity: glow }}
        className="pointer-events-none absolute inset-x-[10%] -top-10 h-56 rounded-full bg-brand/30 blur-[90px]"
      />
      <m.div
        style={{ rotateX, scale, transformOrigin: "50% 0%" }}
        className="relative mx-auto max-w-5xl rounded-[1.6rem] border border-foreground/10 bg-gradient-to-b from-foreground/[0.07] to-foreground/[0.02] p-1.5 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.55)] backdrop-blur-sm sm:p-2.5"
      >
        <div className="overflow-hidden rounded-[1.15rem] border border-foreground/10 bg-background">{children}</div>
      </m.div>
    </div>
  )
}
