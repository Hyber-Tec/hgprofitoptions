import type { Metadata } from "next"
import { LuInfo } from "react-icons/lu"
import { formatDate } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getTargetGroups } from "@/lib/data/tools"
import { buildChannelRows } from "@/lib/tools/channels"
import { AsOf, PageHeader } from "@/components/portal/page-header"
import { ChannelsTable } from "@/components/portal/tools/channels-table"
import { Watermark } from "@/components/portal/watermark"
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
  const asOf = rows[0]?.asOf ?? null
  return (
    <>
      <Watermark text={viewer.email} />
      <PageHeader
        title="Median & Channel Chart"
        description="Channel lines, BOC levels and the 5, 30 and 90-day medians for every ticker HG follows."
        meta={asOf && <AsOf>Based on the {formatDate(asOf)} close</AsOf>}
        actions={
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
                    The spacing between channel lines, set per ticker. Lines sit at the last close plus or minus whole
                    channels.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">BOC</dt>
                  <dd className="text-muted-foreground">
                    A level one BOC beyond each line, toward the next line. Usually half or a quarter of CH.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Medians</dt>
                  <dd className="text-muted-foreground">
                    The midpoint of the highest high and lowest low over the last week, 30 days and 90 days. ▲ means the
                    price is above it, ▼ below.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">FS and SS</dt>
                  <dd className="text-muted-foreground">Key levels HG marks for each stock.</dd>
                </div>
              </dl>
            </PopoverContent>
          </Popover>
        }
      />
      <ChannelsTable rows={rows} groups={groups.map((g) => ({ slug: g.slug, shortName: g.shortName }))} />
    </>
  )
}
