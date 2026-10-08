"use client"

import { m, useInView } from "motion/react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"
import { EASE_OUT } from "../motion"
import { Section, SectionHeading } from "../section"

const STEPS = [
  {
    title: "Map the channel",
    body: "Every stock HG covers has a channel size. Lines step up and down from the last close, with a BOC level between them, so you can see at a glance where price sits.",
  },
  {
    title: "Check the medians",
    body: "The 5, 30 and 90-day medians show whether price is trading above or below the middle of its recent range.",
  },
  {
    title: "Plan the exit before the entry",
    body: "Each alert comes with a buy point, targets and a stop. In class, HG explains why those levels were chosen, so you learn to make the call yourself.",
  },
] as const

// The illustration's price scale: channel lines every 6.00 from a last close of 118.40.
const LINES = [130.4, 124.4, 118.4, 112.4, 106.4]
const BOCS = [127.4, 121.4, 115.4, 109.4]
const MEDIAN = 113.85
const PATH = [
  117.2, 116.8, 117.5, 116.4, 115.9, 116.3, 115.2, 114.6, 115, 113.9, 113.2, 113.6, 112.8, 112.6, 113.4, 114.1, 113.7,
  114.9, 115.6, 115.3, 116.4, 117.2, 116.8, 117.9, 118.6, 118.1, 119.3, 120.2, 119.8, 121.1, 121.6, 121.2, 122.4, 123.1,
  122.7, 123.8, 124.5, 124, 124.3, 123.9,
]
const BUY_INDEX = 13
const TARGET_INDEX = 36

const W = 600
const H = 360
const PLOT_RIGHT = 476
const y = (price: number) => 20 + ((132 - price) / 28) * (H - 40)
const x = (index: number) => 16 + (index / (PATH.length - 1)) * (PLOT_RIGHT - 32)
const PRICE_D = PATH.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ")

/** How much of the price path each step reveals. */
const DRAWN = [0.36, 0.6, 1]

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

function MethodChart({ step }: { step: number }) {
  const ref = useRef<HTMLElement>(null)
  const seen = useInView(ref, { once: true, amount: 0.35 })
  const emphasis = (layer: number) => ({ opacity: step === layer ? 1 : step > layer ? 0.55 : 0.3 })
  const transition = { duration: 0.6, ease: EASE_OUT }
  return (
    <figure
      ref={ref}
      className="relative overflow-hidden rounded-2xl border bg-card/60 p-4 shadow-xl shadow-black/5 backdrop-blur-sm sm:p-6 dark:shadow-black/30"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand/15 blur-3xl"
      />
      <div className="relative mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Channel ladder · illustration</span>
        <span className="num">CH 6.00 · BOC 3.00</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="An illustrated price chart with channel lines 6.00 apart, BOC levels halfway between them and a 30-day median. Price dips to the line below the last close, where a buy point is marked, then climbs to the line above, marked as the target, with a stop at the BOC level below the buy point."
        className="relative h-auto w-full overflow-visible"
      >
        <defs>
          <linearGradient id="method-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <m.g initial={false} animate={emphasis(0)} transition={transition}>
          {LINES.map((level) => (
            <g key={level}>
              <line
                x1={0}
                x2={PLOT_RIGHT}
                y1={y(level)}
                y2={y(level)}
                stroke="currentColor"
                className={level === 118.4 ? "text-foreground/50" : "text-foreground/20"}
                strokeDasharray={level === 118.4 ? undefined : "4 5"}
              />
              <text x={W} y={y(level) + 4} textAnchor="end" className="num fill-muted-foreground text-[12px]">
                {level === 118.4 ? "Last 118.40" : level.toFixed(2)}
              </text>
            </g>
          ))}
          {BOCS.map((level) => (
            <line
              key={level}
              x1={0}
              x2={PLOT_RIGHT}
              y1={y(level)}
              y2={y(level)}
              stroke="var(--brand)"
              strokeOpacity="0.35"
              strokeDasharray="1 6"
              strokeLinecap="round"
            />
          ))}
          <text x={PLOT_RIGHT} y={y(121.4) - 6} textAnchor="end" className="fill-brand text-[11px] font-medium">
            BOC
          </text>
        </m.g>

        <m.g initial={false} animate={emphasis(1)} transition={transition}>
          <line
            x1={0}
            x2={PLOT_RIGHT}
            y1={y(MEDIAN)}
            y2={y(MEDIAN)}
            stroke="var(--brand-2)"
            strokeWidth="1.5"
            strokeDasharray="8 6"
          />
          <rect x={8} y={y(MEDIAN) + 6} width={92} height={20} rx={6} className="fill-background/80" />
          <text x={16} y={y(MEDIAN) + 20} className="fill-brand-2 text-[11px] font-medium">
            30D median
          </text>
        </m.g>

        <m.path
          d={`${PRICE_D} L${x(PATH.length - 1)},${H} L${x(0)},${H} Z`}
          fill="url(#method-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: seen && step === 2 ? 1 : 0 }}
          transition={{ duration: 0.8 }}
        />
        <m.path
          d={PRICE_D}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: seen ? (DRAWN[step] ?? 1) : 0 }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
        />

        <m.g
          initial={{ opacity: 0 }}
          animate={{ opacity: seen && step === 2 ? 1 : 0 }}
          transition={{ ...transition, delay: seen && step === 2 ? 0.7 : 0 }}
        >
          <line
            x1={x(BUY_INDEX) - 30}
            x2={PLOT_RIGHT}
            y1={y(109.4)}
            y2={y(109.4)}
            stroke="var(--negative)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text x={x(BUY_INDEX) - 30} y={y(109.4) + 16} className="fill-negative text-[11px] font-medium">
            Stop
          </text>
          <circle cx={x(BUY_INDEX)} cy={y(PATH[BUY_INDEX] ?? 0)} r="6" fill="var(--positive)" />
          <circle cx={x(BUY_INDEX)} cy={y(PATH[BUY_INDEX] ?? 0)} r="12" fill="var(--positive)" fillOpacity="0.2" />
          <text
            x={x(BUY_INDEX)}
            y={y(PATH[BUY_INDEX] ?? 0) + 28}
            textAnchor="middle"
            className="fill-positive text-[12px] font-semibold"
          >
            Buy point
          </text>
          <circle cx={x(TARGET_INDEX)} cy={y(124.4)} r="6" fill="var(--brand)" />
          <circle cx={x(TARGET_INDEX)} cy={y(124.4)} r="12" fill="var(--brand)" fillOpacity="0.2" />
          <text
            x={x(TARGET_INDEX)}
            y={y(124.4) - 18}
            textAnchor="middle"
            className="fill-brand text-[12px] font-semibold"
          >
            Target
          </text>
        </m.g>
      </svg>
      <figcaption className="relative mt-3 text-xs text-muted-foreground">
        Illustration only, not a real trade or a recommendation. Real trades can hit the stop instead of the target.
      </figcaption>
    </figure>
  )
}

export function Method() {
  const [active, setActive] = useState(0)
  const stepsRef = useRef<HTMLOListElement>(null)
  // Phones see the whole chart above the steps; wider screens walk through it as the steps scroll by.
  const stacked = !useMediaQuery("(min-width: 1024px)")

  useEffect(() => {
    const steps = stepsRef.current?.querySelectorAll<HTMLElement>("[data-step]")
    if (!steps) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step))
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    )
    steps.forEach((step) => observer.observe(step))
    return () => observer.disconnect()
  }, [])

  const shown = stacked ? 2 : active

  return (
    <Section id="method" className="overflow-x-clip">
      <SectionHeading
        eyebrow="The method"
        title="Learn how HG reads a chart"
        lead="HG teaches a system of channels and medians for timing entries and exits. Here is the idea in three steps."
      />
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <ol ref={stepsRef} className="order-2 flex flex-col gap-4 lg:order-1 lg:gap-[22vh] lg:pt-[14vh] lg:pb-[6vh]">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              data-step={index}
              className={cn(
                "flex gap-4 rounded-2xl border p-5 transition-[background-color,border-color,opacity] duration-500 lg:p-6",
                stacked || active === index
                  ? "border-brand/30 bg-card/70 shadow-lg shadow-black/5 dark:shadow-black/30"
                  : "border-transparent opacity-50",
              )}
            >
              <span
                className={cn(
                  "num flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-500",
                  stacked || active === index
                    ? "border-brand bg-brand text-primary-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="order-1 lg:sticky lg:top-28 lg:order-2 lg:self-start">
          <MethodChart step={shown} />
        </div>
      </div>
    </Section>
  )
}
