import BG from "country-flag-icons/react/3x2/BG"
import CA from "country-flag-icons/react/3x2/CA"
import CN from "country-flag-icons/react/3x2/CN"
import GB from "country-flag-icons/react/3x2/GB"
import IE from "country-flag-icons/react/3x2/IE"
import RW from "country-flag-icons/react/3x2/RW"
import SG from "country-flag-icons/react/3x2/SG"
import US from "country-flag-icons/react/3x2/US"
import Image from "next/image"
import type { CSSProperties } from "react"
import { LuInfo } from "react-icons/lu"
import type { FlagComponent } from "country-flag-icons/react/3x2"
import { formatPercent, formatSignedMoney } from "@/core/format"
import type { TestimonialDoc } from "@/server/model"
import { cn } from "@/lib/utils"
import { MarqueeFrame } from "../marquee-frame"
import { Section, SectionHeading } from "../section"

const FLAGS: Record<string, FlagComponent> = { BG, CA, CN, GB, IE, RW, SG, US }

/** Each column scrolls at its own pace; hovering or the pause button stops it. */
const COLUMN =
  "flex flex-col gap-5 pb-5 animate-marquee-up hover:[animation-play-state:paused] group-data-[paused]/marquee:[animation-play-state:paused] motion-reduce:animate-none"

function MemberAvatar({ testimonial }: { testimonial: TestimonialDoc }) {
  const Flag = testimonial.flag ? FLAGS[testimonial.flag] : undefined
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10">
      {testimonial.avatar ? (
        <Image src={testimonial.avatar} alt="" width={80} height={80} className="size-full object-cover" />
      ) : Flag ? (
        <Flag title={testimonial.location} className="h-full w-auto max-w-none scale-150" />
      ) : (
        <span className="text-sm font-medium">{testimonial.name.slice(0, 1)}</span>
      )}
    </span>
  )
}

function TestimonialCard({ testimonial, hidden }: { testimonial: TestimonialDoc; hidden?: boolean }) {
  const { trade } = testimonial
  return (
    <figure
      aria-hidden={hidden || undefined}
      className="flex flex-col gap-4 rounded-2xl border bg-card/70 p-5 shadow-lg shadow-black/5 backdrop-blur-sm sm:p-6 dark:shadow-black/25"
    >
      {trade && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border bg-background/60 px-3 py-2">
          <span className="font-mono text-xs text-foreground">
            {trade.symbol} ${trade.strike.toFixed(2)} {trade.type === "call" ? "Call" : "Put"} · Exp {trade.expiryLabel}
          </span>
          <span className="num flex items-center gap-1.5 text-sm font-semibold text-positive">
            {formatSignedMoney(trade.realizedProfit, trade.currency)}
            {trade.currency !== "USD" && <span className="text-[11px] font-normal">{trade.currency}</span>}
            <span className="rounded-md bg-positive/12 px-1.5 py-0.5 text-[11px]">
              {formatPercent(trade.percentGain, { digits: 0 })}
            </span>
          </span>
        </div>
      )}
      <blockquote className="text-[0.95rem] leading-relaxed text-pretty text-foreground/85">
        &ldquo;{testimonial.quote}&rdquo;
      </blockquote>
      <figcaption className="flex items-center gap-3">
        <MemberAvatar testimonial={testimonial} />
        <span className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{testimonial.name}</span>
          <span className="text-xs text-muted-foreground">{testimonial.location}</span>
        </span>
      </figcaption>
    </figure>
  )
}

function Column({ items, seconds, className }: { items: TestimonialDoc[]; seconds: number; className?: string }) {
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className={COLUMN} style={{ "--marquee-duration": `${seconds}s` } as CSSProperties}>
        {items.map((t) => (
          <TestimonialCard key={t.id} testimonial={t} />
        ))}
        {/* The loop's second lap: hidden from screen readers, which already heard it once. */}
        {items.map((t) => (
          <TestimonialCard key={`${t.id}-again`} testimonial={t} hidden />
        ))}
      </div>
    </div>
  )
}

export function Testimonials({ items }: { items: TestimonialDoc[] }) {
  // Dealt round-robin, so photos and flags mix in every column.
  const columns = [0, 1, 2].map((c) => items.filter((_, i) => i % 3 === c))
  return (
    <Section id="reviews" className="overflow-x-clip">
      <SectionHeading
        eyebrow="Member stories"
        title="Real members, real trades"
        lead="Members from 8+ countries share their experience of the class, in their own words."
      />
      <p className="mx-auto mb-8 flex max-w-2xl items-start gap-3 rounded-xl border bg-card/60 px-4 py-3 text-sm leading-relaxed text-pretty text-muted-foreground">
        <LuInfo aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          These trades and quotes are individual members&apos; experiences, not typical results, and they don&apos;t
          predict how you will do. Options trading is risky and many people lose money.
        </span>
      </p>
      <MarqueeFrame>
        <div className="flex max-h-[46rem] gap-5 overflow-hidden mask-[linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
          <Column items={columns[0] ?? []} seconds={64} />
          <Column items={columns[1] ?? []} seconds={78} className="hidden md:block" />
          <Column items={columns[2] ?? []} seconds={70} className="hidden lg:block" />
        </div>
      </MarqueeFrame>
    </Section>
  )
}
