import Link from "next/link"
import { LuArrowRight } from "react-icons/lu"
import type { FaqDoc } from "@/server/model"
import { Button } from "@/components/ui/button"
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
          <Button variant="outline" render={<Link href="/faq" />} nativeButton={false}>
            See all FAQs
            <LuArrowRight data-icon="inline-end" />
          </Button>
        </div>
        <FaqAccordion faqs={faqs} />
      </div>
    </Section>
  )
}
