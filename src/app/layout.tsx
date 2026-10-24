import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { THEME_SCRIPT } from "@/core/theme"
import { Providers } from "@/components/shared/providers"
import { publicEnv } from "@/lib/env.public"
import "./globals.css"

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: { default: "HG Profit Options", template: "%s · HG Profit Options" },
  description:
    "Options trading education with HG: a 24/7 classroom with live weekly classes, a personal trading plan built one-on-one with HG, real-time alerts and member tools.",
  applicationName: "HG Profit Options",
  openGraph: { type: "website", siteName: "HG Profit Options" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sets light or dark before the first paint; the root layout renders once, on the server. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
