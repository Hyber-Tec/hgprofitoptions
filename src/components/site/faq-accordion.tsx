import type { FaqDoc } from "@/server/model"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export function FaqAnswer({ faq }: { faq: FaqDoc }) {
  return faq.answer.length === 1 ? (
    <p>{faq.answer[0]}</p>
  ) : (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {faq.answer.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

export function FaqAccordion({ faqs }: { faqs: FaqDoc[] }) {
  return (
    <Accordion className="w-full">
      {faqs.map((faq) => (
        <AccordionItem key={faq.id} value={faq.id}>
          <AccordionTrigger className="text-left text-base **:data-[slot=accordion-trigger-icon]:mt-1">
            <span className="flex flex-col gap-1">
              <span>{faq.question}</span>
              {faq.subtitle && <span className="text-sm font-normal text-muted-foreground">{faq.subtitle}</span>}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
            <FaqAnswer faq={faq} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
