import Image from "next/image"
import { LuArrowRight, LuChartLine, LuTrophy } from "react-icons/lu"
import { ButtonLink } from "@/components/shared/button-link"
import { cn } from "@/lib/utils"
import { Reveal } from "../motion"
import { Eyebrow, HEADING_GRADIENT } from "../section"

const MILESTONES = [
  { year: "1999", label: "Entrepreneur" },
  { year: "2003 to 2021", label: "Stakes-winning thoroughbred trainer" },
  { year: "2016", label: "Full-time options trader" },
  { year: "2023", label: "Founded HG Profit Options" },
]

export function Mentor() {
  return (
    <section id="mentor" className="relative scroll-mt-20 overflow-x-clip py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 *:min-w-0 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8">
        <Reveal className="relative mx-auto w-full max-w-sm sm:max-w-md">
          <div aria-hidden className="absolute -inset-8 rounded-[3rem] bg-brand/20 blur-3xl" />
          <div className="relative overflow-hidden rounded-3xl border border-foreground/10 shadow-2xl shadow-black/20">
            <Image
              src="/media/about/hg-portrait.webp"
              alt="Hubert Gaffney (HG) with one of his horses"
              width={960}
              height={1200}
              sizes="(min-width: 1024px) 28rem, (min-width: 640px) 28rem, 90vw"
              className="aspect-[4/5] h-auto w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 pt-16 pb-12 text-white">
              <p className="text-lg font-semibold">Hubert &ldquo;HG&rdquo; Gaffney</p>
              <p className="text-sm text-white/75">Founder of HG Profit Options</p>
            </div>
          </div>
          <div className="absolute -top-4 -left-2 flex items-center gap-2.5 rounded-xl border bg-card/90 px-3.5 py-2.5 shadow-xl backdrop-blur-md sm:-left-8">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand/12 text-brand">
              <LuChartLine className="size-4" />
            </span>
            <div className="text-xs">
              <p className="font-semibold text-foreground">Since 2016</p>
              <p className="text-muted-foreground">Full-time options trader</p>
            </div>
          </div>
          <div className="absolute -right-2 -bottom-5 flex items-center gap-2.5 rounded-xl border bg-card/90 px-3.5 py-2.5 shadow-xl backdrop-blur-md sm:-right-8">
            <span className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <LuTrophy className="size-4" />
            </span>
            <div className="text-xs">
              <p className="font-semibold text-foreground">Top 100 NHC handicapper</p>
              <p className="text-muted-foreground">His horses earned over $2 million in purses</p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="flex flex-col items-start gap-6">
          <Eyebrow>Meet your mentor</Eyebrow>
          <h2
            className={cn(
              "pb-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]",
              HEADING_GRADIENT,
            )}
          >
            From the racetrack to the trading desk
          </h2>
          <p className="text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            For nearly two decades HG trained stakes-winning thoroughbreds, a career built on reading patterns, managing
            risk and executing under pressure. In 2016 he brought those skills to the markets as a full-time options
            trader, and in 2023 he founded HG Profit Options to teach them to others.
          </p>
          <ol className="grid w-full grid-cols-2 gap-x-6 gap-y-4 border-y py-6 sm:grid-cols-4">
            {MILESTONES.map((milestone) => (
              <li key={milestone.year} className="flex flex-col gap-1">
                <span className="num text-sm font-semibold text-brand">{milestone.year}</span>
                <span className="text-sm leading-snug text-muted-foreground">{milestone.label}</span>
              </li>
            ))}
          </ol>
          <figure className="flex flex-col gap-2">
            <blockquote className="text-lg leading-snug font-medium text-pretty text-foreground sm:text-xl">
              &ldquo;To help traders navigate the markets with clarity, confidence, and consistency.&rdquo;
            </blockquote>
            <figcaption className="text-sm text-muted-foreground">HG&apos;s mission</figcaption>
          </figure>
          <ButtonLink href="/about" variant="outline" size="lg" className="h-11 rounded-full px-5">
            Read HG&apos;s story
            <LuArrowRight data-icon="inline-end" />
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  )
}
