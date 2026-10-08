"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { LuCalendarCheck, LuLayoutDashboard, LuLogIn, LuMenu, LuShield } from "react-icons/lu"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { UserMenu } from "@/components/shared/user-menu"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { Logo } from "./logo"

const NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
] as const

export interface HeaderViewer {
  fullName: string
  email: string
  role: "admin" | "member"
}

export function SiteHeader({ viewer }: { viewer: HeaderViewer | null }) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md transition-colors supports-[backdrop-filter]:bg-background/60",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "relative rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive(item.href) &&
                  "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-px after:bg-foreground",
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
            <ButtonLink variant="ghost" className="hidden sm:inline-flex" href="/login">
              <LuLogIn data-icon="inline-start" />
              Member login
            </ButtonLink>
          )}
          <ButtonAnchor className="hidden sm:inline-flex" href="/book" target="_blank" rel="noopener">
            <LuCalendarCheck data-icon="inline-start" />
            Book intro call
          </ButtonAnchor>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}>
              <LuMenu />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,100vw)]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
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
                  Book intro call
                </ButtonAnchor>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
