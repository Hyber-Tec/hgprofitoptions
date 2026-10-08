import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Reveal } from "./motion"

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("relative scroll-mt-20 py-20 sm:py-28", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}

/** A small pill above a heading that names the section. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/8 px-3 py-1 text-xs font-medium tracking-wide text-brand",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
      {children}
    </p>
  )
}

/** Headings fade from full strength to a softer tone, a quiet nod to the hero. */
export const HEADING_GRADIENT = "bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent"

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: {
  eyebrow?: string
  title: string
  lead?: string
  align?: "center" | "left"
  className?: string
}) {
  return (
    <Reveal
      blur
      className={cn(
        "mb-12 flex max-w-3xl flex-col gap-4 sm:mb-16",
        align === "center" ? "mx-auto items-center text-center" : "items-start",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          "pb-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]",
          HEADING_GRADIENT,
        )}
      >
        {title}
      </h2>
      {lead && <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">{lead}</p>}
    </Reveal>
  )
}
