import type { VariantProps } from "class-variance-authority"
import Link from "next/link"
import type { ComponentProps } from "react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Variants = VariantProps<typeof buttonVariants>

/**
 * A link styled as a button. Rendering a link through the Button component would give it
 * role="button", so screen readers would announce navigation as an action.
 */
export function ButtonLink({
  variant = "default",
  size = "default",
  className,
  ...props
}: ComponentProps<typeof Link> & Variants) {
  return <Link data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

/** The same for plain anchors: downloads, external pages, and redirects that must not be prefetched. */
export function ButtonAnchor({
  variant = "default",
  size = "default",
  className,
  ...props
}: ComponentProps<"a"> & Variants) {
  return <a data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
