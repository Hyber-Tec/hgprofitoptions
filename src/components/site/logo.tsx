import Link from "next/link"
import { cn } from "@/lib/utils"
import { LOGO_PATH, LOGO_VIEWBOX } from "./logo-mark-path"

/** HG Profit Options monogram, traced from the original logo. Inherits the current text color. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} fill="currentColor" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <path fillRule="evenodd" d={LOGO_PATH} />
    </svg>
  )
}

export function Logo({ className, href = "/" }: { className?: string; href?: "/" | "/members" | "/admin" }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      aria-label="HG Profit Options home"
    >
      <LogoMark className="size-8" />
      <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
        HG Profit <span className="text-muted-foreground">Options</span>
      </span>
    </Link>
  )
}
