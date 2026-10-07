import type { Metadata } from "next"
import { Suspense } from "react"
import { todayInMarketZone } from "@/core/dates"
import { formatDateWithWeekday } from "@/core/format"
import { isMarketOpen } from "@/core/schedule"
import { requireActiveMember } from "@/lib/auth/guards"
import {
  CardSkeleton,
  ClassroomCard,
  EarningsCard,
  LatestAlertsCard,
  MarketPulseCard,
  MembershipCard,
  MoversCard,
  PerformanceCard,
  RecentContentCard,
  StandingCard,
  TargetsCard,
} from "@/components/portal/dashboard/cards"
import { PageHeader } from "@/components/portal/page-header"
import { PushPromptCard } from "@/components/portal/push-controls"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const viewer = await requireActiveMember("/members")
  const open = isMarketOpen()
  return (
    <>
      <PageHeader
        title={`Welcome back, ${viewer.firstName}`}
        description={
          <>
            {formatDateWithWeekday(todayInMarketZone())} ·{" "}
            <span className={open ? "text-positive" : undefined}>{open ? "Market open" : "Market closed"}</span>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <PushPromptCard />
          <Suspense fallback={<CardSkeleton lines={3} />}>
            <LatestAlertsCard viewer={viewer} />
          </Suspense>
          <div className="grid gap-6 md:grid-cols-2">
            <Suspense fallback={<CardSkeleton lines={2} />}>
              <PerformanceCard viewer={viewer} />
            </Suspense>
            <Suspense fallback={<CardSkeleton lines={2} />}>
              <StandingCard />
            </Suspense>
          </div>
          <Suspense fallback={<CardSkeleton lines={1} />}>
            <TargetsCard />
          </Suspense>
          <div className="grid gap-6 md:grid-cols-2">
            <Suspense fallback={<CardSkeleton lines={3} />}>
              <MoversCard />
            </Suspense>
            <Suspense fallback={<CardSkeleton lines={3} />}>
              <EarningsCard />
            </Suspense>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <MembershipCard viewer={viewer} bookingHref="/book" />
          <Suspense fallback={<CardSkeleton lines={2} />}>
            <ClassroomCard timezone={viewer.member.timezone} />
          </Suspense>
          <Suspense fallback={<CardSkeleton lines={3} />}>
            <MarketPulseCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton lines={2} />}>
            <RecentContentCard />
          </Suspense>
        </div>
      </div>
    </>
  )
}
