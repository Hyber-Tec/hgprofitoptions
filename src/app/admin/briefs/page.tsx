import type { Metadata } from "next"
import Link from "next/link"
import { LuPencil } from "react-icons/lu"
import { addDays, isoDateInZone, todayInMarketZone, zonedDateTime } from "@/core/dates"
import { formatDateTimeET, formatDateWithWeekday } from "@/core/format"
import { isTradingDay } from "@/core/holidays"
import { formatTimeIn } from "@/core/schedule"
import { requireEditor } from "@/lib/auth/guards"
import { getBrief, getBriefSettings, listAllBriefs } from "@/lib/data/briefs"
import { integrations } from "@/lib/env.server"
import {
  BriefComposer,
  BriefSettingsForm,
  DeleteBriefButton,
  type BriefFormValue,
} from "@/components/admin/brief-forms"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Market brief" }

const ET = "America/New_York"

/** "2026-10-23T09:40" in New York, for a datetime field. */
function localInput(instant: Date): string {
  return `${isoDateInZone(instant, ET)}T${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ET }).format(instant)}`
}

/** The brief's next times: what is left of today, then the next market day. */
function nextSlots(times: readonly string[], now: Date): { value: string; label: string }[] {
  const today = todayInMarketZone(now)
  const slots: { value: string; label: string }[] = []
  for (let offset = 0; offset < 7 && slots.length < times.length + 1; offset++) {
    const date = addDays(today, offset)
    if (!isTradingDay(date)) continue
    for (const time of times) {
      const at = zonedDateTime(date, time)
      if (at.getTime() <= now.getTime()) continue
      slots.push({
        value: `${date}T${time}`,
        label: `${offset === 0 ? "Today" : formatDateWithWeekday(date)}, ${formatTimeIn(at, ET)}`,
      })
    }
    if (offset > 0) break
  }
  return slots
}

const EMPTY: BriefFormValue = { id: null, title: "", body: "", status: null, publishAt: null, notify: true }

export default async function AdminBriefsPage({ searchParams }: PageProps<"/admin/briefs">) {
  await requireEditor({ next: "/admin/briefs" })
  const editId = (await searchParams).edit
  const [briefs, settings, editing] = await Promise.all([
    listAllBriefs(),
    getBriefSettings(),
    typeof editId === "string" ? getBrief(editId) : Promise.resolve(null),
  ])
  const initial: BriefFormValue = editing
    ? {
        id: editing.id,
        title: editing.title,
        body: editing.body,
        status: editing.status,
        publishAt: editing.publishAt ? localInput(editing.publishAt) : null,
        notify: editing.notify,
      }
    : EMPTY

  return (
    <>
      <PageHeader
        title="Market brief"
        description="The pre-market view and the updates in the first hour. Paste the brief and post it now or at its time, or let AI write it."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{editing ? `Edit: ${editing.title}` : "New brief"}</CardTitle>
            {editing?.status === "published" && (
              <CardDescription>
                Posted {editing.publishedAt ? formatDateTimeET(editing.publishedAt) : ""}. Members see your changes at
                once.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <BriefComposer key={initial.id ?? "new"} initial={initial} slots={nextSlots(settings.times, new Date())} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Times and AI</CardTitle>
          </CardHeader>
          <CardContent>
            <BriefSettingsForm initial={settings} aiReady={integrations.ai} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Briefs</CardTitle>
          <CardDescription>Posted, scheduled and drafts, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {briefs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No briefs yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {briefs.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{b.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.status === "published" && b.publishedAt
                        ? `Posted ${formatDateTimeET(b.publishedAt)}`
                        : b.status === "scheduled" && b.publishAt
                          ? `Goes out ${formatDateTimeET(b.publishAt)}`
                          : "Draft"}
                      {b.source === "ai" ? " · written by AI" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <ToneBadge
                      tone={b.status === "published" ? "positive" : b.status === "scheduled" ? "neutral" : "muted"}
                    >
                      {b.status === "published" ? "Posted" : b.status === "scheduled" ? "Scheduled" : "Draft"}
                    </ToneBadge>
                    <Link
                      href={`/admin/briefs?edit=${b.id}`}
                      aria-label={`Edit ${b.title}`}
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <LuPencil className="size-4" />
                    </Link>
                    <DeleteBriefButton id={b.id} title={b.title} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
