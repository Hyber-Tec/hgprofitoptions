import type { Viewport } from "next"
import type { ReactNode } from "react"
import { SiteMotion } from "@/components/site/motion"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getViewer } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"

/** The browser bar matches the site's navy background (see the data-site palette in globals.css). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050914" },
    { media: "(prefers-color-scheme: light)", color: "#f6f8fc" },
  ],
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [viewer, settings] = await Promise.all([getViewer(), getSiteSettings()])
  return (
    <div data-site className="contents">
      <SiteMotion>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-3 focus:ring-ring/50"
        >
          Skip to content
        </a>
        <SiteHeader viewer={viewer ? { fullName: viewer.fullName, email: viewer.email, role: viewer.role } : null} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter settings={settings} />
      </SiteMotion>
    </div>
  )
}
