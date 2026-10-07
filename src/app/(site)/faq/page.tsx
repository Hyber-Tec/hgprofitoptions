import type { Metadata } from "next"
import { FaqSearch } from "@/components/site/faq-search"
import { CtaBand } from "@/components/site/home/cta"
import { FAQ_GROUPS } from "@/content/faqs"
import { getFaqs } from "@/lib/data/public"

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "What you need, what to expect, how much time it takes, and how membership works at HG Profit Options.",
}

export default async function FaqPage() {
  const faqs = await getFaqs()
  const groups = [...new Set([...FAQ_GROUPS, ...faqs.map((f) => f.group)])]
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer.join(" ") },
    })),
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <section className="border-b">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">FAQ</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Frequently asked questions</h1>
          <p className="text-lg text-muted-foreground">Everything you need to know before you join.</p>
        </div>
      </section>
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <FaqSearch faqs={faqs} groups={groups} />
        </div>
      </section>
      <CtaBand title="Still have questions?" lead="Book a free 15-minute call and ask HG directly." />
    </>
  )
}
