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
    <footer className="relative isolate overflow-hidden border-t bg-muted/30">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent"
      />
      <LogoMark className="pointer-events-none absolute -right-24 -bottom-32 -z-10 size-[28rem] text-foreground/[0.03]" />
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-16 *:min-w-0 sm:grid-cols-3 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-10 lg:px-8">
        <div className="col-span-2 flex flex-col gap-4 sm:col-span-3 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-8" />
            <span className="text-[15px] font-semibold tracking-tight">
              HG Profit <span className="text-muted-foreground">Options</span>
            </span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Options trading education with live classes, one-on-one mentoring and HG&apos;s own research, for members in
            more than eight countries.
          </p>
          <div className="flex gap-1">
            {socials.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex size-9 items-center justify-center rounded-full border bg-background/50 text-muted-foreground transition-colors outline-none hover:border-brand/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
        <FooterColumn
          title="Explore"
          links={[
            { href: "/", label: "Home" },
            { href: "/about", label: "About HG" },
            { href: "/faq", label: "FAQ" },
          ]}
        />
        <FooterColumn
          title="Members"
          links={[
            { href: "/login", label: "Member login" },
            { href: "/book", label: "Book a call" },
          ]}
        />
        <FooterColumn
          title="Legal"
          links={[
            { href: "/legal/terms", label: "Membership terms" },
            { href: "/legal/privacy", label: "Privacy policy" },
            { href: "/legal/risk-disclosure", label: "Risk disclosure" },
          ]}
        />
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6 lg:px-8">
          <p>
            Educational content only, not investment advice. Options trading involves risk and is not suitable for every
            investor. Results are not typical and past performance does not guarantee future results. Before trading
            options, read{" "}
            <a
              href="https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Characteristics and Risks of Standardized Options
            </a>
            .
          </p>
          <p>© {new Date().getFullYear()} HG Profit Options. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

const FOOTER_LINK =
  "rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: {
    href: "/" | "/about" | "/faq" | "/login" | "/book" | "/legal/terms" | "/legal/privacy" | "/legal/risk-disclosure"
    label: string
  }[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            {link.href === "/book" ? (
              // A redirect to the external scheduler: a plain link, so nothing prefetches it.
              <a href={link.href} target="_blank" rel="noopener" className={FOOTER_LINK}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className={FOOTER_LINK}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
