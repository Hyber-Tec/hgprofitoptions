import BG from "country-flag-icons/react/3x2/BG"
import CA from "country-flag-icons/react/3x2/CA"
import CN from "country-flag-icons/react/3x2/CN"
import GB from "country-flag-icons/react/3x2/GB"
import IE from "country-flag-icons/react/3x2/IE"
import RW from "country-flag-icons/react/3x2/RW"
import SG from "country-flag-icons/react/3x2/SG"
import US from "country-flag-icons/react/3x2/US"
import Image from "next/image"
import type { ReactNode } from "react"
import type { IconType } from "react-icons"
import {
  LuBellRing,
  LuCalendarClock,
  LuChartCandlestick,
  LuGlobe,
  LuNotebookPen,
  LuTarget,
  LuVideo,
} from "react-icons/lu"
import type { SiteSettings } from "@/server/model"
import { cn } from "@/lib/utils"
import { LogoMark } from "../logo"
import { RevealGroup, RevealItem } from "../motion"
import { Section, SectionHeading } from "../section"
import { SpotlightGroup } from "../spotlight-group"
import { DEMO_ALERT } from "./demo-data"
import { JournalMock, LadderMock, TargetsMock } from "./mockups"

type Schedule = SiteSettings["classSchedule"]

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** "18:00" → "6:00 PM". */
function clock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

const COUNTRIES = [
  { code: "US", name: "United States", Flag: US },
  { code: "CA", name: "Canada", Flag: CA },
  { code: "GB", name: "United Kingdom", Flag: GB },
  { code: "IE", name: "Ireland", Flag: IE },
  { code: "BG", name: "Bulgaria", Flag: BG },
  { code: "RW", name: "Rwanda", Flag: RW },
  { code: "SG", name: "Singapore", Flag: SG },
  { code: "CN", name: "China", Flag: CN },
]

function BentoCard({
  Icon,
  title,
  body,
  visual,
  className,
}: {
  Icon: IconType
  title: string
  body: string
  visual: ReactNode
  className?: string
}) {
  return (
    <RevealItem
      className={cn(
        "spotlight-card flex flex-col overflow-hidden rounded-2xl border bg-card/60 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div aria-hidden className="relative flex min-h-44 flex-1 flex-col justify-center overflow-hidden px-5 pt-5">
        {visual}
      </div>
      <div className="flex flex-col gap-2 p-6 pt-5">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Icon className="size-4 text-brand" />
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{body}</p>
      </div>
    </RevealItem>
  )
}

function ClassesVisual({ schedule }: { schedule: Schedule }) {
  return (
    <div className="grid items-center gap-4 *:min-w-0 sm:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-negative/10 px-2 py-0.5 font-medium text-negative">
            <span className="size-1.5 rounded-full bg-negative" />
            Live on Zoom
          </span>
          <span className="text-muted-foreground">Every Saturday</span>
        </div>
        {schedule.map((session) => (
          <div
            key={`${session.day}-${session.start}`}
            className="flex items-center gap-3 rounded-xl border bg-background/60 p-3"
          >
            <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-brand/10 py-1.5 text-brand">
              <span className="text-[10px] font-semibold tracking-wide uppercase">{WEEKDAY[session.day]}</span>
              <span className="num text-sm font-semibold">{clock(session.start).replace(/ [AP]M$/, "")}</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {clock(session.start)} to {clock(session.end)} ET · {session.audience}
              </p>
            </div>
          </div>
        ))}
      </div>
      {/* A class in progress: HG sharing a channel chart. */}
      <div className="relative hidden overflow-hidden rounded-xl border bg-background/70 p-3 sm:block">
        <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">HG is sharing his screen</span>
          <span className="rounded bg-negative px-1.5 py-px font-semibold tracking-wide text-white">LIVE</span>
        </div>
        <LadderMock id="classes-ladder" className="max-h-28" />
        <div className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-lg border bg-card/90 p-1 pr-2 shadow-md backdrop-blur">
          <Image
            src="/media/about/hg-portrait.webp"
            alt=""
            width={56}
            height={56}
            className="size-6 rounded-md object-cover"
          />
          <span className="text-[10px] font-medium text-foreground">HG</span>
        </div>
      </div>
    </div>
  )
}

function OneOnOneVisual() {
  // A month at a glance: Saturday classes as dots, one private session highlighted.
  const days = Array.from({ length: 35 }, (_, i) => i - 2)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Image
          src="/media/about/hg-portrait.webp"
          alt=""
          width={96}
          height={96}
          className="size-11 rounded-full object-cover ring-2 ring-brand/40"
        />
        <div className="min-w-0 text-xs">
          <p className="text-sm font-medium text-foreground">Your session with HG</p>
          <p className="text-muted-foreground">Once a month · 60 minutes</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-0.5 font-medium">
            {d}
          </span>
        ))}
        {days.map((day, i) => (
          <span
            key={i}
            className={cn(
              "num relative flex h-6 items-center justify-center rounded-md",
              day < 1 || day > 31 ? "opacity-0" : "bg-foreground/[0.04]",
              day === 15 && "bg-brand font-semibold text-primary-foreground shadow-[0_0_16px_-2px_var(--brand)]",
            )}
          >
            {day >= 1 && day <= 31 ? day : ""}
            {i % 7 === 6 && day >= 1 && day <= 31 && (
              <span className="absolute bottom-0.5 size-1 rounded-full bg-brand-2" />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

function AlertsVisual() {
  return (
    <div className="relative pb-4">
      <div className="absolute inset-x-6 top-4 h-full rounded-xl border bg-card/40" />
      <div className="absolute inset-x-3 top-2 h-full rounded-xl border bg-card/70" />
      <div className="relative rounded-xl border bg-card p-3.5 shadow-lg">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <LogoMark className="size-4 text-foreground" />
          HG Profit Options
          <span className="ml-auto">now</span>
        </div>
        <p className="mt-2 text-sm font-medium text-foreground">New alert from HG</p>
        <p className="truncate text-xs text-muted-foreground">
          {DEMO_ALERT.kind} {DEMO_ALERT.title}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
          {["In the app", "Browser", "Email"].map((channel) => (
            <span key={channel} className="rounded-full border px-2 py-0.5 text-muted-foreground">
              {channel}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function CommunityVisual() {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="grid grid-cols-4 gap-2.5">
        {COUNTRIES.map(({ code, name, Flag }) => (
          <Flag key={code} title={name} className="h-6 w-9 rounded-[3px] shadow-sm ring-1 ring-foreground/10" />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="num font-semibold text-foreground">24/7</span> · members around the world
      </p>
    </div>
  )
}

export function Program({ schedule }: { schedule: Schedule }) {
  return (
    <Section id="program">
      <SectionHeading
        eyebrow="The program"
        title="Everything you need to trade options with confidence"
        lead="Live teaching, HG's research and tools to track your progress, all in one quarterly membership."
      />
      <RevealGroup>
        <SpotlightGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BentoCard
            className="md:col-span-2"
            Icon={LuVideo}
            title="Live classes every Saturday"
            body="A beginner session, then a class for all traders, live on Zoom with HG. Bring your questions and your charts."
            visual={<ClassesVisual schedule={schedule} />}
          />
          <BentoCard
            Icon={LuCalendarClock}
            title="A one-on-one with HG every month"
            body="A private hour each month with HG on the method, risk management and your questions."
            visual={<OneOnOneVisual />}
          />
          <BentoCard
            Icon={LuBellRing}
            title="Real-time alerts"
            body="HG's buy and sell alerts arrive the moment they are published, each with a buy point, targets and a stop, and every member gets the same alerts."
            visual={<AlertsVisual />}
          />
          <BentoCard
            Icon={LuTarget}
            title="Weekly strike price targets"
            body="Targets, break levels and put strikes for the week ahead, with what changed since the last update."
            visual={<TargetsMock compact />}
          />
          <BentoCard
            Icon={LuChartCandlestick}
            title="Median & Channel Chart"
            body="Each stock's channel and BOC levels, its 5, 30 and 90-day medians, and the next line up and down."
            visual={<LadderMock id="program-ladder" className="max-h-40" />}
          />
          <BentoCard
            className="lg:col-span-2"
            Icon={LuNotebookPen}
            title="Your trading journal"
            body="Log trades by hand, import a CSV, or link your brokerage read-only. Write down your plan and lessons, and track your own win rate and streaks over time."
            visual={<JournalMock wide />}
          />
          <BentoCard
            Icon={LuGlobe}
            title="A 24/7 live classroom"
            body="Learn alongside members in 8+ countries, with questions answered any day of the week."
            visual={<CommunityVisual />}
          />
        </SpotlightGroup>
      </RevealGroup>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Also included: Key Market Data, the Leveraged ETF Guide, class presentations and a files library.
      </p>
    </Section>
  )
}
