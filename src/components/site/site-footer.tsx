import Link from "next/link"
import { SiInstagram, SiX, SiYoutube } from "react-icons/si"
import type { SiteSettings } from "@/server/model"
import { LogoMark } from "./logo"

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const socials = [
    { href: settings.instagramUrl, label: "Instagram", Icon: SiInstagram },
    { href: settings.youtubeUrl, label: "YouTube", Icon: SiYoutube },
    { href: settings.xUrl, label: "X", Icon: SiX },
  ].filter((s): s is typeof s & { href: string } => s.href !== null)

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 *:min-w-0 sm:grid-cols-3 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-10 lg:px-8">
        <div className="col-span-2 flex flex-col gap-4 sm:col-span-3 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-8" />
            <span className="text-[15px] font-semibold tracking-tight">
              HG Profit <span className="text-muted-foreground">Options</span>
            </span>
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">A comprehensive educational platform geared to maximize member profit through hands-on experience.</p>
          <div className="flex gap-1">
            {socials.map(({ href, label, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
        <FooterColumn title="Explore" links={[{ href: "/", label: "Home" }, { href: "/about", label: "About" }, { href: "/faq", label: "FAQ" }]} />
        <FooterColumn title="Members" links={[{ href: "/login", label: "Member login" }, { href: "/book", label: "Book a call" }]} />
        <FooterColumn title="Legal" links={[{ href: "/legal/terms", label: "Membership terms" }, { href: "/legal/privacy", label: "Privacy policy" }, { href: "/legal/risk-disclosure", label: "Risk disclosure" }]} />
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>Educational content only, not investment advice. Options trading involves risk and is not suitable for every investor. Results are not typical and past performance does not guarantee future results.</p>
          <p>© {new Date().getFullYear()} HG Profit Options. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: { href: "/" | "/about" | "/faq" | "/login" | "/book" | "/legal/terms" | "/legal/privacy" | "/legal/risk-disclosure"; label: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
