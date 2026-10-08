"use client"

import { domAnimation, LazyMotion, m, MotionConfig, stagger, type Variants } from "motion/react"
import type { ReactNode } from "react"

/** The site's easing: a quick start that settles softly. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

/**
 * Motion for the public site. Animations load lazily with the small DOM feature set, and visitors who
 * prefer reduced motion get fades instead of movement.
 */
export function SiteMotion({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  )
}

/** Shown once, when it scrolls into view: a short rise out of a soft blur. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  blur = false,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  /** Blur is lovely on headings but costly on large areas, so it is opt-in. */
  blur?: boolean
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y, ...(blur ? { filter: "blur(8px)" } : {}) }}
      whileInView={{ opacity: 1, y: 0, ...(blur ? { filter: "blur(0px)" } : {}) }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  )
}

const groupVariants = (interval: number, delay: number): Variants => ({
  hidden: {},
  shown: { transition: { delayChildren: stagger(interval, { startDelay: delay }) } },
})

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
}

/** Reveals its RevealItem children one after another. */
export function RevealGroup({
  children,
  className,
  interval = 0.08,
  delay = 0,
  as = "div",
}: {
  children: ReactNode
  className?: string
  interval?: number
  delay?: number
  as?: "div" | "ul" | "ol" | "dl"
}) {
  const Component = m[as]
  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={groupVariants(interval, delay)}
    >
      {children}
    </Component>
  )
}

export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode
  className?: string
  as?: "div" | "li"
}) {
  const Component = m[as]
  return (
    <Component className={className} variants={itemVariants}>
      {children}
    </Component>
  )
}
