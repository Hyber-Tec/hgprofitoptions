import { LuChevronDown } from "react-icons/lu"
import { WEEKDAYS, mainClass, partOfDay, type ClassSession } from "@/core/schedule"
import { cn } from "@/lib/utils"
import { ShaderBackground } from "../shader-background"

/** Entrance animation in plain CSS, so the first view never waits for JavaScript. */
const ENTER =
  "animate-in fade-in slide-in-from-bottom-4 blur-in-sm fill-mode-both duration-1000 ease-out motion-reduce:animate-none"

/**
 * No buttons here on purpose: HG wants visitors to scroll through the whole page before booking the free
 * call, which waits at the bottom. The class days and times come from the class schedule.
 */
export function Hero({ schedule }: { schedule: readonly ClassSession[] }) {
  const main = mainClass(schedule)
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

      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col items-center justify-center px-4 pt-16 pb-28 text-center sm:px-6 sm:pt-20">
        <p
          className={cn(
            ENTER,
            "inline-flex items-center gap-2.5 rounded-full border border-foreground/10 bg-background/40 px-3.5 py-1.5 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-md sm:text-sm",
          )}
        >
          <span aria-hidden className="size-2 rounded-full bg-positive shadow-[0_0_8px_var(--positive)]" />
          {main ? `Live class every ${WEEKDAYS[main.day] ?? ""}` : "Live classes every week"}
          <span aria-hidden className="hidden h-3.5 w-px bg-foreground/15 sm:block" />
          <span className="hidden text-muted-foreground sm:inline">Members in 8+ countries</span>
        </p>

        <h1
          className={cn(
            ENTER,
            "mt-7 max-w-6xl text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance delay-100 sm:text-5xl xl:text-[3.25rem]",
          )}
        >
          {/* Two lines on wide screens, as HG asked; narrower screens wrap where they need to. */}
          <span className="xl:block">Taking options trading to the next level,</span>{" "}
          <span className="xl:block">
            <span className="bg-gradient-to-r from-brand via-brand-2 to-brand bg-clip-text text-transparent">
              unlocking unlimited profits
            </span>{" "}
            for the investor.
          </span>
        </h1>

        <div
          className={cn(
            ENTER,
            "mt-6 flex max-w-2xl flex-col gap-3 text-base leading-relaxed text-pretty text-muted-foreground delay-200 sm:gap-4 sm:text-lg lg:text-xl",
          )}
        >
          <p>
            Our comprehensive classroom is open 24/7
            {main
              ? ` and starts every ${WEEKDAYS[main.day] ?? ""} ${partOfDay(main.start)} with a group class that sets the tone for the trading week ahead.`
              : ", with live group classes that set the tone for the trading week ahead."}
          </p>
          <p>
            By working one-on-one with HG, you&apos;ll develop a personal trading plan that maximizes your
            portfolio&apos;s benefits.
          </p>
        </div>

        <a
          href="#inside"
          className={cn(
            ENTER,
            "group/scroll mt-12 inline-flex flex-col items-center gap-1 rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors delay-300 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          See what members get
          <LuChevronDown
            aria-hidden
            className="size-5 motion-safe:animate-bounce motion-safe:[animation-duration:2s]"
          />
        </a>
        <p className={cn(ENTER, "mt-5 text-sm text-balance text-muted-foreground delay-700")}>
          Education only, not investment advice. Options involve risk.
        </p>
      </div>
    </section>
  )
}
