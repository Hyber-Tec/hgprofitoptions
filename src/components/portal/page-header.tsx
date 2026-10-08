import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Title row for portal pages: heading, one-line description, optional actions and an "as of" note. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        {meta && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** "As of Oct 6, 2026" style freshness stamp. */
export function AsOf({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
      {children}
    </span>
  )
}
