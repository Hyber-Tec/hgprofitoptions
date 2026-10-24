import type { MetadataRoute } from "next"
import { publicEnv } from "@/lib/env.public"

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL
  return ["", "/about", "/faq", "/trial", "/legal/terms", "/legal/privacy", "/legal/risk-disclosure"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path.startsWith("/legal") ? "yearly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }))
}
