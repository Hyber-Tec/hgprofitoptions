import type { Metadata } from "next"
import Link from "next/link"
import { formatDate } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { listPublishedRecaps } from "@/lib/data/recaps"
import { PageHeader } from "@/components/portal/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Class recaps" }

export default async function RecapsPage() {
  await requireActiveMember("/members/classroom/recaps")
  const recaps = await listPublishedRecaps()
  return (
    <>
      <PageHeader
        title="Class recaps"
        description="What each class covered: the key points, the tickers discussed and the questions asked. Written by AI from the class recording."
      />
      {recaps.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No recaps yet</EmptyTitle>
            <EmptyDescription>The recap of each class shows up here a little while after it ends.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {recaps.map((r) => (
            <li key={r.id}>
              <Link
                href={`/members/classroom/recaps/${r.id}`}
                className="flex flex-col gap-1 px-4 py-3.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{formatDate(r.date)}</span>
                </span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{r.summary?.overview}</span>
                {r.summary && r.summary.tickers.length > 0 && (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {r.summary.tickers.map((t) => t.symbol).join(" · ")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
