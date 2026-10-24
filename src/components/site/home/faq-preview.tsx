import { LuArrowRight, LuMessageCircleQuestion } from "react-icons/lu"
import type { FaqDoc } from "@/server/model"
import { ButtonLink } from "@/components/shared/button-link"
import { FaqAccordion } from "../faq-accordion"
import { Reveal } from "../motion"
import { Section, SectionHeading } from "../section"

export function FaqPreview({ faqs }: { faqs: FaqDoc[] }) {
  return (
    <Section id="faq">
      <div className="grid gap-10 *:min-w-0 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions before you join?"
            lead="Here are the answers members ask about most."
            align="left"
            className="mb-0 sm:mb-0"
          />
          <Reveal delay={0.1} className="flex w-full flex-col gap-4 rounded-2xl border bg-card/60 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand">
                <LuMessageCircleQuestion className="size-4.5" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-medium text-foreground">Still unsure?</p>
                <p className="text-sm text-muted-foreground">
                  Ask HG directly on a free 15-minute call, at the end of this page. No credit card needed.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink variant="outline" href="/faq" className="rounded-full px-3.5">
                See all FAQs
                <LuArrowRight data-icon="inline-end" />
              </ButtonLink>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.15} className="self-start rounded-2xl border bg-card/60 px-5 py-2 backdrop-blur-sm sm:px-7">
          <FaqAccordion faqs={faqs} />
        </Reveal>
      </div>
    </Section>
  )
}
