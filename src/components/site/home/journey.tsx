"use client"

import { m, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react"
import { useRef, useState } from "react"
import type { IconType } from "react-icons"
import { LuCalendarCheck, LuCheck, LuGraduationCap, LuMailCheck, LuTarget, LuX } from "react-icons/lu"
import { cn } from "@/lib/utils"
import { Reveal } from "../motion"
import { Section, SectionHeading } from "../section"

const STEPS: { title: string; body: string; note: string; Icon: IconType }[] = [
  {
    title: "Book a free call",
    body: "A 15-minute Zoom call with HG. Talk through your experience and goals, and ask anything about the class.",
    note: "Free · 15 minutes · No credit card",
    Icon: LuCalendarCheck,
  },
  {
    title: "Join for a quarter",
    body: "Memberships run by calendar quarter. HG sets yours up and you receive a personal invitation to create your login.",
    note: "Invite-only member area",
    Icon: LuMailCheck,
  },
  {
    title: "Learn live with HG",
    body: "Join the Saturday classes, book your monthly one-on-one, and learn alongside members in the 24/7 classroom.",
    note: "Beginners welcome",
    Icon: LuGraduationCap,
  },
  {
    title: "Trade with a plan",
    body: "Study HG's alerts and weekly strike targets, read the channel charts, and record every trade you choose to make in your journal.",
    note: "Your progress, tracked",
    Icon: LuTarget,
  },
]

export function Journey() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 65%", "end 55%"] })
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 })
  const [reached, setReached] = useState(0)
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setReached(Math.min(STEPS.length - 1, Math.floor(value * (STEPS.length - 1) + 0.25)))
  })
  const lit = (index: number) => reduced === true || index <= reached

  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="From your first call to your first plan"
        lead="Joining takes one conversation. Here is what happens next."
      />
      <div ref={ref} className="relative mx-auto max-w-3xl">
        <div aria-hidden className="absolute top-5 bottom-5 left-5 w-px bg-border" />
        <m.div
          aria-hidden
          style={{ scaleY: reduced ? 1 : progress }}
          className="absolute top-5 bottom-5 left-5 w-px origin-top bg-gradient-to-b from-brand via-brand-2 to-brand shadow-[0_0_12px_var(--brand)]"
        />
        <ol className="flex flex-col gap-10 sm:gap-14">
          {STEPS.map(({ title, body, note, Icon }, index) => (
            <li key={title} className="relative grid gap-2 pl-16 sm:pl-20">
              <span
                className={cn(
                  "absolute top-0 left-0 flex size-10 items-center justify-center rounded-full border ring-8 ring-background transition-[background-color,border-color,color,box-shadow] duration-500",
                  lit(index)
                    ? "border-brand bg-brand text-primary-foreground shadow-[0_0_24px_-4px_var(--brand)]"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-4.5" />
              </span>
              <p className="num text-xs font-medium tracking-widest text-brand uppercase">Step {index + 1}</p>
              <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h3>
              <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">{body}</p>
              <p className="mt-1 inline-flex w-fit items-center rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                {note}
              </p>
            </li>
          ))}
        </ol>
      </div>
      <Reveal className="mx-auto mt-16 grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card/60 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LuCheck className="size-4 text-positive" /> Made for
          </p>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
            Beginners and active traders who want a rules-based way to plan every trade, and can join the live Saturday
            classes.
          </p>
        </div>
        <div className="rounded-2xl border bg-card/60 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LuX className="size-4 text-negative" /> Not for
          </p>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
            Anyone looking for guaranteed income, trades to copy, or someone to manage their money.
          </p>
        </div>
      </Reveal>
    </Section>
  )
}
