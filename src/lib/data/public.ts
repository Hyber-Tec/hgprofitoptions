import "server-only"
import { FAQS } from "@/content/faqs"
import { TESTIMONIALS } from "@/content/testimonials"
import {
  COLLECTIONS,
  DEFAULT_SITE_SETTINGS,
  faqSchema,
  parseDoc,
  siteSettingsSchema,
  testimonialSchema,
  type FaqDoc,
  type SiteSettings,
  type TestimonialDoc,
} from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; value: unknown }>()

/** Small in-memory cache so public pages do not query Firestore on every request. */
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

export function invalidatePublicCache(): void {
  cache.clear()
}

async function safely<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (error) {
    console.error("public content fallback", error)
    return fallback
  }
}

export function getSiteSettings(): Promise<SiteSettings> {
  return cached("site", () =>
    safely(async () => {
      const snap = await adminDb().collection(COLLECTIONS.settings).doc("site").get()
      if (!snap.exists) return DEFAULT_SITE_SETTINGS
      const parsed = siteSettingsSchema.safeParse(snap.data())
      return parsed.success ? parsed.data : DEFAULT_SITE_SETTINGS
    }, DEFAULT_SITE_SETTINGS),
  )
}

export function getTestimonials(): Promise<TestimonialDoc[]> {
  const fallback = TESTIMONIALS.filter((t) => t.published)
  return cached("testimonials", () =>
    safely(async () => {
      const snap = await adminDb()
        .collection(COLLECTIONS.testimonials)
        .where("published", "==", true)
        .orderBy("order")
        .get()
      if (snap.empty) return fallback
      return snap.docs
        .map((d) => parseDoc(testimonialSchema, d.id, d.data()))
        .filter((t): t is TestimonialDoc => t !== null)
    }, fallback),
  )
}

export function getFaqs(): Promise<FaqDoc[]> {
  const fallback = FAQS.filter((f) => f.published)
  return cached("faqs", () =>
    safely(async () => {
      const snap = await adminDb().collection(COLLECTIONS.faqs).where("published", "==", true).orderBy("order").get()
      if (snap.empty) return fallback
      return snap.docs.map((d) => parseDoc(faqSchema, d.id, d.data())).filter((f): f is FaqDoc => f !== null)
    }, fallback),
  )
}
