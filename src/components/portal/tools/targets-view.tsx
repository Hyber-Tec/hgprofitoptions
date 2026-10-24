import { LuDownload, LuPencil } from "react-icons/lu"
import type { IsoDate } from "@/core/domain/types"
import { formatDate, formatDateWithWeekday } from "@/core/format"
import type { Viewer } from "@/lib/auth/guards"
import { openTargetUpdates } from "@/lib/data/tools"
import { postsCutoff } from "@/lib/data/visibility"
import { integrations } from "@/lib/env.server"
import { buildTargetRows } from "@/lib/tools/targets"
import type { TargetUpdate } from "@/server/model"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { AsOf, PageHeader } from "../page-header"
import { ToneBadge } from "../display"
import { HeldBackNotice } from "../trial-notice"
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
  const cutoff = await postsCutoff(viewer)
  const [{ rows, removed, groups }, updates, all] = await Promise.all([
    buildTargetRows(update, previous),
    openTargetUpdates(cutoff),
    openTargetUpdates(),
  ])
  const latest = updates[0]?.effectiveDate ?? update.effectiveDate
  // On a free trial, the newest updates wait (members get them as they are published).
  const held = all.length - updates.length
  const options = updates.map((u) => ({ value: u.effectiveDate, label: formatDateWithWeekday(u.effectiveDate) }))
  const lastClose = rows.reduce<IsoDate | null>(
    (latest, r) => (r.lastCloseDate && (!latest || r.lastCloseDate > latest) ? r.lastCloseDate : latest),
    null,
  )
  return (
    <>
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
            {integrations.marketData ? (
              <AsOf>Prices update live during the day</AsOf>
            ) : (
              lastClose && <AsOf>Prices from the {formatDate(lastClose)} close</AsOf>
            )}
            {update.effectiveDate !== latest && (
              <span className="font-medium text-warning">You are viewing an older update</span>
            )}
          </>
        }
        actions={
          <>
            <UpdatePicker options={options} current={update.effectiveDate} latest={latest} />
            <PrintButton />
            <ButtonAnchor
              variant="outline"
              size="sm"
              className="print:hidden"
              href={`/members/targets/${update.effectiveDate}/pdf`}
            >
              <LuDownload />
              PDF
            </ButtonAnchor>
            {viewer.role === "admin" && (
              <ButtonLink size="sm" className="print:hidden" href={`/admin/targets/${update.effectiveDate}?edit=1`}>
                <LuPencil />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />
      {held > 0 && <HeldBackNotice>This week&apos;s strike targets are for members</HeldBackNotice>}
      <TargetsTable rows={rows} removed={removed} groups={groups} live={integrations.marketData} />
      <p className="hidden text-xs text-muted-foreground print:block">
        Printed for {viewer.fullName} ({viewer.email}). HG Profit Options member content. Do not share.
      </p>
      <p className="text-xs text-muted-foreground print:hidden">
        {integrations.marketData ? "Tap a ticker for its order book." : "Tap a ticker for its details."} Status compares
        the latest price with the target and break levels. Educational content, not personalized investment advice.
      </p>
    </>
  )
}
