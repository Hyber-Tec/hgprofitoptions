import type { Metadata } from "next"
import { CtaBand } from "@/components/site/home/cta"
import { FaqPreview } from "@/components/site/home/faq-preview"
import { Hero } from "@/components/site/home/hero"
import { MemberPreview } from "@/components/site/home/member-preview"
import { HowItWorks, Offer } from "@/components/site/home/offer"
import { Testimonials } from "@/components/site/home/testimonials"
import { Section, SectionHeading } from "@/components/site/section"
import { getFaqs, getTestimonials } from "@/lib/data/public"

export const metadata: Metadata = {
  title: { absolute: "HG Profit Options · Options trading education" },
  description:
    "Unlock the keys to profitable options trading. Live Saturday classes, monthly one-on-ones, real-time alerts and exclusive member tools.",
}

const PREVIEW_FAQ_IDS = ["what-do-i-need", "while-working", "what-will-i-learn"]

export default async function HomePage() {
  const [testimonials, faqs] = await Promise.all([getTestimonials(), getFaqs()])
  const preview = PREVIEW_FAQ_IDS.map((id) => faqs.find((f) => f.id === id)).filter(
    (f): f is NonNullable<typeof f> => f !== undefined,
  )
  return (
    <>
      <Hero />
      <Offer />
      <HowItWorks />
      <MemberPreview />
      <Section id="testimonials" className="border-t bg-muted/30">
        <SectionHeading eyebrow="What members say" title="Real members, real trades" />
        <Testimonials items={testimonials} />
      </Section>
      <FaqPreview faqs={preview.length > 0 ? preview : faqs.slice(0, 3)} />
      <CtaBand />
    </>
  )
}
