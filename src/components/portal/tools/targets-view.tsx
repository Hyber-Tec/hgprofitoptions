import { LuDownload } from "react-icons/lu"
import { formatDate, formatDateWithWeekday } from "@/core/format"
import type { Viewer } from "@/lib/auth/guards"
import { listTargetUpdates } from "@/lib/data/tools"
import { buildTargetRows } from "@/lib/tools/targets"
import type { TargetUpdate } from "@/server/model"
import { Button } from "@/components/ui/button"
import { AsOf, PageHeader } from "../page-header"
import { ToneBadge } from "../display"
import { Watermark } from "../watermark"
import { TargetsTable } from "./targets-table"
import { PrintButton, UpdatePicker } from "./update-picker"

export async function TargetsView({
  viewer,
  update,
  previous,
}: {
  viewer: Viewer
  update: TargetUpdate
  previous: TargetUpdate | null
}) {
  const [{ rows, removed, groups }, updates] = await Promise.all([
    buildTargetRows(update, previous),
    listTargetUpdates(),
  ])
  const latest = updates[0]?.effectiveDate ?? update.effectiveDate
  const options = updates.map((u) => ({ value: u.effectiveDate, label: formatDateWithWeekday(u.effectiveDate) }))
  const lastClose = rows.find((r) => r.lastCloseDate)?.lastCloseDate ?? null
  return (
    <>
      <Watermark text={viewer.email} />
      <PageHeader
        title="Strike Price Targets"
        description="HG's weekly targets, break levels and put strikes, with where each stock sits right now."
        meta={
          <>
            <ToneBadge tone="neutral">Updated {formatDateWithWeekday(update.effectiveDate)}</ToneBadge>
            {update.revision > 1 && (
              <span>
                Corrected (version {update.revision}){update.changeNote ? `: ${update.changeNote}` : ""}
              </span>
            )}
            {lastClose && <AsOf>Prices as of the {formatDate(lastClose)} close</AsOf>}
            {update.effectiveDate !== latest && (
              <span className="font-medium text-warning">You are viewing an older update</span>
            )}
          </>
        }
        actions={
          <>
            <UpdatePicker options={options} current={update.effectiveDate} latest={latest} />
            <PrintButton />
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/members/targets/${update.effectiveDate}/pdf`} />}
              nativeButton={false}
              className="print:hidden"
            >
              <LuDownload />
              PDF
            </Button>
          </>
        }
      />
      <TargetsTable rows={rows} removed={removed} groups={groups} />
      <p className="hidden text-xs text-muted-foreground print:block">
        Printed for {viewer.fullName} ({viewer.email}). HG Profit Options member content. Do not share.
      </p>
      <p className="text-xs text-muted-foreground print:hidden">
        Status compares the last close with the target and break level. Educational content, not personalized investment
        advice.
      </p>
    </>
  )
}
