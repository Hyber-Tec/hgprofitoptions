import type { ReactNode } from "react"
import { LogoMark, Logo } from "@/components/site/logo"
import { ShaderBackground } from "@/components/site/shader-background"
import { ThemeToggle } from "@/components/shared/theme-toggle"

/** Sign-in pages share the public site's navy palette (data-site), so the way in looks like the site. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-site className="grid min-h-svh flex-1 *:min-w-0 lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative isolate hidden overflow-hidden border-r lg:flex lg:flex-col lg:justify-between lg:p-10">
        <ShaderBackground still className="absolute inset-0 -z-10" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-background/90 via-background/40 to-background/70"
        />
        <Logo className="relative" />
        <figure className="relative flex max-w-md flex-col gap-4">
          <LogoMark className="size-10 text-muted-foreground" />
          <blockquote className="text-xl leading-snug font-medium text-balance">
            &ldquo;From someone who was scared of option trading and had zero knowledge, in just a month&apos;s time I
            have learned some good practices of the game! The group class and the 1 on 1&apos;s are so beneficial and
            make you feel you are going to do ok. I highly recommend HG Options!&rdquo;
          </blockquote>
          <figcaption className="text-sm text-muted-foreground">Vikram I., Pennsylvania</figcaption>
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
