import type { IconType } from "react-icons"
import {
  LuActivity,
  LuBellRing,
  LuChartCandlestick,
  LuLayoutDashboard,
  LuNotebookPen,
  LuPresentation,
  LuSearch,
  LuTarget,
  LuWallet,
} from "react-icons/lu"
import { WEEKDAYS, mainClass, type ClassSession } from "@/core/schedule"
import { publicEnv } from "@/lib/env.public"
import { CountUp } from "../count-up"
import { LogoMark } from "../logo"
import { RevealGroup, RevealItem } from "../motion"
import { SectionHeading } from "../section"
import { AlertMock, JournalMock, LadderMock, MockCard, TargetsMock } from "./mockups"
import { ScrollTilt } from "./scroll-tilt"

const SIDEBAR: { label: string; Icon: IconType; badge?: string }[] = [
  { label: "Dashboard", Icon: LuLayoutDashboard },
  { label: "Alerts", Icon: LuBellRing, badge: "2" },
  { label: "Strike targets", Icon: LuTarget },
  { label: "Channels", Icon: LuChartCandlestick },
  { label: "Market data", Icon: LuActivity },
  { label: "Journal", Icon: LuNotebookPen },
  { label: "Portfolio", Icon: LuWallet },
  { label: "Classroom", Icon: LuPresentation },
]

/** "6:00 PM" from "18:00". */
function clock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number)
  return `${String(((h + 11) % 12) + 1)}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

function DashboardMockup({ schedule }: { schedule: readonly ClassSession[] }) {
  const host = new URL(publicEnv.NEXT_PUBLIC_SITE_URL).host
  return (
    <div
      role="img"
      aria-label="A preview of the member area with demo data: a buy alert with its buy point, targets and stop, this week's strike targets, the class times, a channel ladder and a journal entry."
      className="@container flex flex-col text-left text-muted-foreground select-none"
    >
      <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto truncate rounded-md bg-background/80 px-3 py-1 text-[11px]">{host}/members</div>
        <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          Demo data
        </span>
      </div>
      <div className="flex h-[27rem] sm:h-[34rem] lg:h-[37rem]">
        <aside className="hidden w-48 shrink-0 flex-col gap-1 border-r bg-muted/25 p-3 @3xl:flex">
          <div className="mb-3 flex items-center gap-2 px-2 text-foreground">
            <LogoMark className="size-6" />
            <span className="text-[13px] font-semibold">HG Profit Options</span>
          </div>
          {SIDEBAR.map(({ label, Icon, badge }, index) => (
            <div
              key={label}
              className={
                index === 0
                  ? "flex items-center gap-2.5 rounded-md bg-foreground/[0.07] px-2 py-1.5 text-[12px] font-medium text-foreground"
                  : "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px]"
              }
            >
              <Icon className="size-3.5" />
              {label}
              {badge && (
                <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                  {badge}
                </span>
              )}
            </div>
          ))}
        </aside>
        <div className="relative flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Welcome back</p>
              <p className="truncate text-[11px]">Prices as of Friday&apos;s close</p>
            </div>
            <span className="ml-auto hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] @lg:inline-flex">
              <span className="size-1.5 rounded-full bg-positive" /> Market open
            </span>
            <span className="hidden items-center gap-2 rounded-md border bg-background px-2 py-1 text-[11px] @2xl:inline-flex">
              <LuSearch className="size-3" /> Search tickers, alerts, trades
              <kbd className="rounded border px-1 text-[10px]">⌘K</kbd>
            </span>
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-3 @2xl:grid-cols-[1.3fr_1fr]">
            <div className="flex min-w-0 flex-col gap-3">
              <MockCard title="Latest alert" aside="From HG · just now">
                <AlertMock />
              </MockCard>
              <MockCard title="Strike targets" aside="This week">
                <TargetsMock />
              </MockCard>
              <MockCard title="Classes this week" aside="Live on Zoom">
                <div className="grid gap-1.5 text-[11px] @lg:grid-cols-2">
                  {schedule.slice(0, 4).map((session) => (
                    <div
                      key={`${String(session.day)}-${session.start}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/70 px-2 py-1.5"
                    >
                      <span className="truncate text-foreground">{session.title}</span>
                      <span className="num shrink-0">
                        {SHORT_DAYS[session.day]} {clock(session.start)}
                      </span>
                    </div>
                  ))}
                </div>
              </MockCard>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <MockCard title="DEMO channel ladder" aside="CH 6.00 · BOC 3.00">
                <LadderMock id="dashboard-ladder" />
              </MockCard>
              <MockCard title="Journal" aside="Latest entry">
                <JournalMock />
              </MockCard>
            </div>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-background"
          />
        </div>
      </div>
    </div>
  )
}

type Stat = { label: string; count?: { value: number; suffix: string }; text?: string }

/** The third figure follows the class schedule, so it never promises a class that moved. */
function stats(schedule: readonly ClassSession[]): Stat[] {
  const main = mainClass(schedule)
  return [
    { count: { value: 8, suffix: "+" }, label: "countries represented by our members" },
    { count: { value: 10, suffix: "+" }, label: "years of trading experience behind every lesson" },
    schedule.length > 0
      ? {
          count: { value: schedule.length, suffix: "" },
          label: `live ${schedule.length === 1 ? "class" : "classes"} every week${main ? `, starting with the ${WEEKDAYS[main.day] ?? ""} group class` : ""}`,
        }
      : { text: "24/7", label: "classroom, with live classes on Zoom" },
    { text: "1:1", label: "a personal trading plan, built with HG" },
  ]
}

export function Showcase({ schedule }: { schedule: readonly ClassSession[] }) {
  return (
    <section id="inside" className="relative scroll-mt-20 overflow-x-clip pt-8 pb-20 sm:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Inside the member area"
          title="Everything HG shares, in one place"
          lead="Alerts, weekly strike targets, channel charts and your own trading journal, side by side. Shown here with demo data."
        />
        <ScrollTilt>
          <DashboardMockup schedule={schedule} />
        </ScrollTilt>
        <RevealGroup
          as="dl"
          className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 sm:mt-20 lg:grid-cols-4"
        >
          {stats(schedule).map((stat) => (
            <RevealItem key={stat.label} className="flex flex-col gap-2 border-l border-brand/30 pl-4">
              <dt className="order-2 text-sm leading-snug text-muted-foreground">{stat.label}</dt>
              <dd className="num order-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {stat.count ? <CountUp value={stat.count.value} suffix={stat.count.suffix} /> : stat.text}
              </dd>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  )
}
