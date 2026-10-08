"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { LuArrowRight, LuCalendarCheck, LuLayoutDashboard, LuLogIn, LuMenu, LuShield } from "react-icons/lu"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { UserMenu } from "@/components/shared/user-menu"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { Logo } from "./logo"

const NAV = [
  { href: "/#program", label: "Program" },
  { href: "/#method", label: "Method" },
  { href: "/about", label: "About HG" },
  { href: "/#reviews", label: "Reviews" },
  { href: "/faq", label: "FAQ" },
] as const

export interface HeaderViewer {
  fullName: string
  email: string
  role: "admin" | "member"
}

/**
 * True once the page has scrolled past `down` pixels, and false again only above `down / 2`,
 * so the header does not flicker at the threshold.
 */
function useScrolled(down: number) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled((was) => (was ? window.scrollY > down / 2 : window.scrollY > down))
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [down])
  return scrolled
}

export function SiteHeader({ viewer }: { viewer: HeaderViewer | null }) {
  const pathname = usePathname()
  const scrolled = useScrolled(16)
  const [open, setOpen] = useState(false)

  // Section links (/#…) are never "the current page"; the pages they live on are.
  const isActive = (href: string) => !href.includes("#") && pathname.startsWith(href)

  return (
    <header
      className={cn(
        "sticky top-0 z-40 mx-auto w-full max-w-6xl border-b border-transparent transition-[top,max-width,background-color,border-color,box-shadow] duration-500 ease-out lg:rounded-full lg:border",
        scrolled &&
          "border-border bg-background/75 shadow-lg shadow-black/5 backdrop-blur-xl lg:top-3 lg:max-w-5xl dark:shadow-black/40",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center gap-6 px-4 transition-[height,padding] duration-500 ease-out sm:px-6",
          scrolled && "lg:h-14 lg:pr-2 lg:pl-5",
        )}
      >
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive(item.href) && "bg-foreground/5 text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {viewer ? (
            <UserMenu viewer={viewer} />
          ) : (
            <ButtonLink variant="ghost" className="hidden rounded-full sm:inline-flex" href="/login">
              <LuLogIn data-icon="inline-start" />
              Member login
            </ButtonLink>
          )}
          <ButtonAnchor
            className="hidden rounded-full px-3.5 shadow-[0_4px_20px_-6px_var(--primary)] sm:inline-flex"
            href="/book"
            target="_blank"
            rel="noopener"
          >
            Book a free call
            <LuArrowRight data-icon="inline-end" />
          </ButtonAnchor>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
              <LuMenu />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,100vw)]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  aria-current={pathname === "/" ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2.5 text-base font-medium",
                    pathname === "/"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  Home
                </Link>
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-base font-medium",
                      isActive(item.href)
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <Separator className="my-2" />
              <div className="flex flex-col gap-2 px-4">
                {viewer ? (
                  <>
                    <ButtonLink variant="outline" size="lg" href="/members" onClick={() => setOpen(false)}>
                      <LuLayoutDashboard data-icon="inline-start" />
                      Member area
                    </ButtonLink>
                    {viewer.role === "admin" && (
                      <ButtonLink variant="outline" size="lg" href="/admin" onClick={() => setOpen(false)}>
                        <LuShield data-icon="inline-start" />
                        Admin
                      </ButtonLink>
                    )}
                  </>
                ) : (
                  <ButtonLink variant="outline" size="lg" href="/login" onClick={() => setOpen(false)}>
                    <LuLogIn data-icon="inline-start" />
                    Member login
                  </ButtonLink>
                )}
                <ButtonAnchor size="lg" href="/book" target="_blank" rel="noopener">
                  <LuCalendarCheck data-icon="inline-start" />
                  Book a free call
                </ButtonAnchor>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
