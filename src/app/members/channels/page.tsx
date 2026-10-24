import type { Metadata } from "next"
import { LuInfo, LuPencil } from "react-icons/lu"
import type { IsoDate } from "@/core/domain/types"
import { formatDate } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getTargetGroups } from "@/lib/data/tools"
import { integrations } from "@/lib/env.server"
import { buildChannelRows } from "@/lib/tools/channels"
import { AsOf, PageHeader } from "@/components/portal/page-header"
import { ChannelsTable } from "@/components/portal/tools/channels-table"
import { ButtonLink } from "@/components/shared/button-link"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"

export const metadata: Metadata = { title: "Median & Channel Chart" }

export default async function ChannelsPage() {
  const viewer = await requireActiveMember("/members/channels")
  const [rows, groups] = await Promise.all([buildChannelRows(), getTargetGroups()])
  // The newest close any stock's lines come from (a stock the provider skipped keeps its older close).
  const asOf = rows.reduce<IsoDate | null>((latest, r) => (!latest || r.asOf > latest ? r.asOf : latest), null)
  return (
    <>
      <PageHeader
        title="Median & Channel Chart"
        description="Each stock's channel lines up and down from its last close, with the BOC levels and the 5, 30 and 90-day medians."
        meta={
          asOf && (
            <>
              <AsOf>Lines from the {formatDate(asOf)} close</AsOf>
              <span>{integrations.marketData ? "Prices update live during the day" : "Prices from that close"}</span>
            </>
          )
        }
        actions={
          <>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                <LuInfo />
                How to read this
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <PopoverHeader>
                  <PopoverTitle>Reading the chart</PopoverTitle>
                  <PopoverDescription>HG&apos;s definitions, as used in class.</PopoverDescription>
                </PopoverHeader>
                <dl className="flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="font-medium">CH (channel)</dt>
                    <dd className="text-muted-foreground">
                      The stock&apos;s normal moving range, set by HG for each stock. The lines sit one channel apart,
                      up and down from the last close in the middle.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">BOC</dt>
                    <dd className="text-muted-foreground">
                      The smaller numbers above the lines: one BOC past each line toward the next one, usually half or a
                      quarter of the channel.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">The dot</dt>
                    <dd className="text-muted-foreground">Where the price is now between the levels.</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Medians</dt>
                    <dd className="text-muted-foreground">
                      The midpoint of the highest high and lowest low over the last week, 30 days and 90 days. ▲ means
                      the price is above it, ▼ below.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">FS and SS</dt>
                    <dd className="text-muted-foreground">Key levels HG marks for each stock.</dd>
                  </div>
                </dl>
              </PopoverContent>
            </Popover>
            {viewer.role === "admin" && (
              <ButtonLink size="sm" href="/admin/tickers">
                <LuPencil />
                Edit channels
              </ButtonLink>
            )}
          </>
        }
      />
      <ChannelsTable
        rows={rows}
        groups={groups.map((g) => ({ slug: g.slug, shortName: g.shortName }))}
        live={integrations.marketData}
      />
    </>
  )
}
