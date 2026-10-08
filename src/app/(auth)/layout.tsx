import type { ReactNode } from "react"
import { LogoMark, Logo } from "@/components/site/logo"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh flex-1 *:min-w-0 lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-muted/30 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div aria-hidden className="bg-grid mask-radial pointer-events-none absolute inset-0" />
        <Logo className="relative" />
        <figure className="relative flex max-w-md flex-col gap-4">
          <LogoMark className="size-10 text-muted-foreground" />
          <blockquote className="text-xl leading-snug font-medium text-balance">
            &ldquo;HG helped me focus on trading a few powerful stocks with the best due diligence available. His
            options class has put me on the path to financial freedom.&rdquo;
          </blockquote>
          <figcaption className="text-sm text-muted-foreground">Joey D., Texas</figcaption>
        </figure>
        <p className="relative text-xs text-muted-foreground">Educational content only, not investment advice.</p>
      </aside>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  )
}
