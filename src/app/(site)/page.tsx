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
import { WEEKDAYS, mainClass } from "@/core/schedule"
import { getFaqs, getSiteSettings, getTestimonials } from "@/lib/data/public"

export const metadata: Metadata = {
  title: { absolute: "HG Profit Options · Options trading education" },
  description:
    "Taking options trading to the next level. A 24/7 classroom with a live weekly group class, a personal trading plan built one-on-one with HG, real-time alerts and member tools for channels, strike targets and your trading journal.",
}

const PREVIEW_FAQ_IDS = ["what-do-i-need", "while-working", "time-required", "membership", "what-will-i-learn"]

export default async function HomePage() {
  const [testimonials, faqs, settings] = await Promise.all([getTestimonials(), getFaqs(), getSiteSettings()])
  const main = mainClass(settings.classSchedule)
  const classDay = main ? (WEEKDAYS[main.day] ?? null) : null
  const preview = PREVIEW_FAQ_IDS.map((id) => faqs.find((f) => f.id === id)).filter(
    (f): f is NonNullable<typeof f> => f !== undefined,
  )
  return (
    <>
      <Hero schedule={settings.classSchedule} />
      <Showcase schedule={settings.classSchedule} />
      <Program schedule={settings.classSchedule} />
      <Method />
      <Mentor />
      <Journey classDay={classDay} />
      <Testimonials items={testimonials} />
      <FaqPreview faqs={preview.length > 0 ? preview : faqs.slice(0, 5)} />
      <CtaBand />
    </>
  )
}
