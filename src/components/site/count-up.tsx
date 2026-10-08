"use client"

import { animate, inView } from "motion/react"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { EASE_OUT } from "./motion"

/**
 * A number that counts up the first time it scrolls into view. The real number is what the server
 * renders, so it reads correctly without JavaScript, above the fold, and with reduced motion.
 */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (element.getBoundingClientRect().top < window.innerHeight) return
    element.textContent = `0${suffix}`
    let stopCounting: (() => void) | undefined
    const stopWatching = inView(
      element,
      () => {
        const controls = animate(0, value, {
          duration: 1.6,
          ease: EASE_OUT,
          onUpdate: (latest) => {
            element.textContent = `${Math.round(latest)}${suffix}`
          },
        })
        stopCounting = () => controls.stop()
      },
      { amount: 0.8 },
    )
    return () => {
      stopWatching()
      stopCounting?.()
      element.textContent = `${value}${suffix}`
    }
  }, [value, suffix])

  return (
    <span ref={ref} className={cn("num", className)}>
      {`${value}${suffix}`}
    </span>
  )
}
