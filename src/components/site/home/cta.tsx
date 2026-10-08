import { LuArrowRight, LuCalendarCheck } from "react-icons/lu"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { LogoMark } from "../logo"
import { Reveal } from "../motion"
import { ShaderBackground } from "../shader-background"

/** The closing call to action, shared by the home, about and FAQ pages. */
export function CtaBand({
  title = "Your journey toward trading excellence begins now",
  lead = "Book a free 15-minute call with HG. Talk through your experience and goals, and see whether the class is right for you.",
  faqLink = true,
}: {
  title?: string
  lead?: string
  /** Off on the FAQ page itself. */
  faqLink?: boolean
}) {
  return (
    <section className="px-4 pt-8 pb-24 sm:px-6 lg:px-8">
      <Reveal className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-foreground/10 px-6 py-20 text-center shadow-2xl shadow-black/10 sm:px-12 sm:py-24 dark:shadow-black/40">
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_70%_80%_at_50%_100%,color-mix(in_oklab,var(--brand)_25%,transparent),transparent_70%)]"
        />
        <ShaderBackground className="absolute inset-0 -z-10" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_50%,color-mix(in_oklab,var(--background)_80%,transparent),transparent)]"
        />
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
          <LogoMark className="size-11 text-foreground/90" />
          <h2 className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl sm:leading-[1.08]">
            {title}
          </h2>
          <p className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">{lead}</p>
          <div className="mt-3 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <ButtonAnchor
              size="lg"
              href="/book"
              target="_blank"
              rel="noopener"
              className="h-12 rounded-full px-6 text-base shadow-[0_8px_30px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)] hover:bg-primary/90"
            >
              <LuCalendarCheck data-icon="inline-start" />
              Book a free 15-min call
            </ButtonAnchor>
            {faqLink && (
              <ButtonLink
                size="lg"
                variant="outline"
                href="/faq"
                className="h-12 rounded-full bg-background/40 px-6 text-base backdrop-blur-md"
              >
                Read the FAQ
                <LuArrowRight data-icon="inline-end" />
              </ButtonLink>
            )}
          </div>
          <p className="text-xs text-muted-foreground">No credit card needed · Memberships run by calendar quarter</p>
        </div>
      </Reveal>
    </section>
  )
}
