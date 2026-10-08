import { LuArrowRight } from "react-icons/lu"
import type { FaqDoc } from "@/server/model"
import { ButtonLink } from "@/components/shared/button-link"
import { FaqAccordion } from "../faq-accordion"
import { Section, SectionHeading } from "../section"

export function FaqPreview({ faqs }: { faqs: FaqDoc[] }) {
  return (
    <Section id="faq" className="border-t">
      <div className="grid gap-10 *:min-w-0 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col items-start gap-4">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions before you join?"
            lead="Here are the answers members ask about most."
            align="left"
            className="mb-2 sm:mb-2"
          />
          <ButtonLink variant="outline" href="/faq">
            See all FAQs
            <LuArrowRight data-icon="inline-end" />
          </ButtonLink>
        </div>
        <FaqAccordion faqs={faqs} />
      </div>
    </Section>
  )
}
