import type { MetadataRoute } from "next"
import { publicEnv } from "@/lib/env.public"

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/members", "/admin", "/api", "/welcome"] }],
    sitemap: `${base}/sitemap.xml`,
  }
}
