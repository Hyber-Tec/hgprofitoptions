import type { Metadata } from "next"
import { CtaBand } from "@/components/site/home/cta"
import { FaqPreview } from "@/components/site/home/faq-preview"
import { Hero } from "@/components/site/home/hero"
import { Journey } from "@/components/site/home/journey"
import { Mentor } from "@/components/site/home/mentor"
import { Method } from "@/components/site/home/method"
import { Program } from "@/components/site/home/program"
import { Showcase } from "@/components/site/home/showcase"
import { Testimonials } from "@/components/site/home/testimonials"
import { getViewer } from "@/lib/auth/guards"
import { getFaqs, getSiteSettings, getTestimonials } from "@/lib/data/public"

export const metadata: Metadata = {
  title: { absolute: "HG Profit Options · Options trading education" },
  description:
    "Learn to trade options with a plan. Live Saturday classes, a monthly one-on-one with HG, real-time alerts and member tools for channels, strike targets and your trading journal.",
}

const PREVIEW_FAQ_IDS = ["what-do-i-need", "while-working", "time-required", "membership", "what-will-i-learn"]

export default async function HomePage() {
  const [testimonials, faqs, settings, viewer] = await Promise.all([
    getTestimonials(),
    getFaqs(),
    getSiteSettings(),
    getViewer(),
  ])
  const preview = PREVIEW_FAQ_IDS.map((id) => faqs.find((f) => f.id === id)).filter(
    (f): f is NonNullable<typeof f> => f !== undefined,
  )
  return (
    <>
      <Hero signedIn={viewer !== null} />
      <Showcase />
      <Program schedule={settings.classSchedule} />
      <Method />
      <Mentor />
      <Journey />
      <Testimonials items={testimonials} />
      <FaqPreview faqs={preview.length > 0 ? preview : faqs.slice(0, 5)} />
      <CtaBand />
    </>
  )
}
