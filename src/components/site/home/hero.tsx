import Image from "next/image"
import { LuArrowRight, LuCalendarCheck, LuLayoutDashboard } from "react-icons/lu"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { cn } from "@/lib/utils"
import { ShaderBackground } from "../shader-background"

/** Members who shared their photo with a testimonial. */
const MEMBER_PHOTOS = ["joey", "maydelis", "jason", "mira", "tan"] as const

/** Entrance animation in plain CSS, so the first view never waits for JavaScript. */
const ENTER =
  "animate-in fade-in slide-in-from-bottom-4 blur-in-sm fill-mode-both duration-1000 ease-out motion-reduce:animate-none"

/** `signedIn` swaps the secondary action for a way back into the member area. */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative isolate -mt-16 overflow-hidden pt-16">
      {/* Shown when WebGL is unavailable, and while the shader fades in. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,color-mix(in_oklab,var(--brand)_22%,transparent),transparent_70%)]"
      />
      <ShaderBackground className="absolute inset-0 -z-10" />
      {/* Calms the filaments behind the text, then fades the hero into the page. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_45%_at_50%_45%,color-mix(in_oklab,var(--background)_78%,transparent),transparent_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-background"
      />

      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-5xl flex-col items-center justify-center px-4 pt-16 pb-28 text-center sm:px-6 sm:pt-20">
        <p
          className={cn(
            ENTER,
            "inline-flex items-center gap-2.5 rounded-full border border-foreground/10 bg-background/40 px-3.5 py-1.5 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-md sm:text-sm",
          )}
        >
          <span aria-hidden className="size-2 rounded-full bg-positive shadow-[0_0_8px_var(--positive)]" />
          Live classes every Saturday
          <span aria-hidden className="hidden h-3.5 w-px bg-foreground/15 sm:block" />
          <span className="hidden text-muted-foreground sm:inline">Members in 8+ countries</span>
        </p>

        <h1
          className={cn(
            ENTER,
            "mt-7 max-w-4xl text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance delay-100 sm:text-6xl lg:text-7xl",
          )}
        >
          Trade options with a plan,{" "}
          <span className="bg-gradient-to-r from-brand via-brand-2 to-brand bg-clip-text text-transparent">
            not a guess.
          </span>
        </h1>

        <p
          className={cn(
            ENTER,
            "mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground delay-200 sm:text-xl",
          )}
        >
          Learn HG&apos;s channel system in live Saturday classes, meet one-on-one with HG every month, and study
          real-time alerts that show a buy point, targets and a stop.
        </p>

        <div className={cn(ENTER, "mt-10 flex w-full flex-col gap-3 delay-300 sm:w-auto sm:flex-row")}>
          <ButtonAnchor
            size="lg"
            href="/book"
            target="_blank"
            rel="noopener"
            className="group/cta h-12 rounded-full px-6 text-base shadow-[0_8px_30px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)] hover:bg-primary/90"
          >
            <LuCalendarCheck data-icon="inline-start" />
            Book a free 15-min call
            <LuArrowRight
              data-icon="inline-end"
              className="transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
            />
          </ButtonAnchor>
          {signedIn ? (
            <ButtonLink
              size="lg"
              variant="outline"
              href="/members"
              className="h-12 rounded-full bg-background/40 px-6 text-base backdrop-blur-md"
            >
              <LuLayoutDashboard data-icon="inline-start" />
              Go to the member area
            </ButtonLink>
          ) : (
            <ButtonLink
              size="lg"
              variant="outline"
              href="/#program"
              className="h-12 rounded-full bg-background/40 px-6 text-base backdrop-blur-md"
            >
              See what members get
            </ButtonLink>
          )}
        </div>

        <div className={cn(ENTER, "mt-10 flex flex-col items-center gap-3 delay-500 sm:flex-row sm:gap-4")}>
          <div aria-hidden className="flex -space-x-2.5">
            {MEMBER_PHOTOS.map((name) => (
              <Image
                key={name}
                src={`/media/testimonials/${name}.webp`}
                alt=""
                width={72}
                height={72}
                className="size-9 rounded-full object-cover ring-2 ring-background"
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Free 15-minute call with HG.</span> No credit card needed.
          </p>
        </div>
        <p className={cn(ENTER, "mt-5 text-sm text-balance text-muted-foreground delay-700")}>
          Education only, not investment advice. Options involve risk.
        </p>
      </div>
    </section>
  )
}
