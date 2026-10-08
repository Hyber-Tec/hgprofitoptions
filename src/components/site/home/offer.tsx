import type { IconType } from "react-icons"
import {
  LuBellRing,
  LuCalendarCheck,
  LuChartLine,
  LuNotebookPen,
  LuPresentation,
  LuSlidersHorizontal,
  LuTarget,
} from "react-icons/lu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Section, SectionHeading } from "../section"

const OFFERS: { title: string; body: string; Icon: IconType }[] = [
  {
    title: "Market insights",
    body: "Our expert team provides strategic financial insights to help traders understand market trends and capitalize on opportunities.",
    Icon: LuChartLine,
  },
  {
    title: "Live classroom",
    body: "Ongoing support and education that equip traders with the tools to navigate profit options, strategic stocks and future stocks.",
    Icon: LuPresentation,
  },
  {
    title: "Tailored service",
    body: "Customized guidance for your risk tolerance and investment goals, for a personal approach to building your portfolio.",
    Icon: LuSlidersHorizontal,
  },
  {
    title: "Member tools and alerts",
    body: "Weekly strike price targets, channel and median charts, key market data, real-time buy and sell alerts, and a journal linked to your brokerage.",
    Icon: LuBellRing,
  },
]

export function Offer() {
  return (
    <Section id="offer">
      <SectionHeading eyebrow="What we offer" title="Everything you need to trade options with confidence" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {OFFERS.map(({ title, body, Icon }) => (
          <Card key={title} className="h-full">
            <CardHeader>
              <div className="mb-2 inline-flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                <Icon className="size-5" />
              </div>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">{body}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  )
}

const STEPS: { title: string; body: string; Icon: IconType }[] = [
  {
    title: "Book your call",
    body: "Schedule a free consultation to discuss your experience and goals.",
    Icon: LuCalendarCheck,
  },
  {
    title: "Enroll in class",
    body: "Plan your personalized curriculum, tailored to your trading profile.",
    Icon: LuNotebookPen,
  },
  {
    title: "Trade with discipline",
    body: "Execute your strategy, achieve your goals, and secure profits.",
    Icon: LuTarget,
  },
]

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-y bg-muted/30">
      <SectionHeading eyebrow="How it works" title="Three steps to get started" />
      <ol className="relative grid gap-10 md:grid-cols-3 md:gap-6">
        <div aria-hidden className="absolute top-6 right-[16.6%] left-[16.6%] hidden h-px bg-border md:block" />
        {STEPS.map(({ title, body, Icon }, index) => (
          <li key={title} className="relative flex flex-col items-center gap-4 text-center">
            <div className="relative flex size-12 items-center justify-center rounded-full border bg-background">
              <Icon className="size-5" />
              <span className="num absolute -top-2 -right-3 rounded-full border bg-background px-1.5 text-[11px] font-medium text-muted-foreground">
                0{index + 1}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-semibold">{title}</h3>
              <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
