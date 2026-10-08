import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("py-16 sm:py-24", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}

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
    <div
      className={cn(
        "mb-10 flex max-w-2xl flex-col gap-3 sm:mb-14",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      {eyebrow && <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{eyebrow}</p>}
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {lead && <p className="text-base text-pretty text-muted-foreground sm:text-lg">{lead}</p>}
    </div>
  )
}
