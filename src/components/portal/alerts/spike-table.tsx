import type { ReactNode } from "react"
import Link from "next/link"
import type { IsoDate } from "@/core/domain/types"
import { formatLevel, formatPercent, formatShortDate, plural } from "@/core/format"
import { describeSpikeTime, spikeGap, type SpikeAt } from "@/core/spikes"
import { ToneBadge } from "@/components/portal/display"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export interface SpikeView {
  id: string
  symbol: string
  price: number
  date: IsoDate
  at: SpikeAt
  time: string | null
  close: number | null
  group: string | null
  recoveredOn: IsoDate | null
  sessionsToRecover: number | null
}

/** "Reached again Oct 26, after 2 sessions", or that it has not been yet. */
export function SpikeStatus({ spike }: { spike: Pick<SpikeView, "recoveredOn" | "sessionsToRecover"> }) {
  if (!spike.recoveredOn) return <ToneBadge tone="muted">Not yet</ToneBadge>
  return (
    <ToneBadge tone="positive">
      {formatShortDate(spike.recoveredOn)}
      {spike.sessionsToRecover !== null && (
        <span className="hidden sm:inline">· {plural(spike.sessionsToRecover, "session")}</span>
      )}
    </ToneBadge>
  )
}

/**
 * One spike list as HG writes it: each stock's spike, when it happened and that day's close, how far the
 * spike is from the close, and whether the stock has traded back to it. HG's headings split the list.
 */
export function SpikeTable({
  spikes,
  listDate,
  linkStocks = true,
  status = true,
  actions,
}: {
  spikes: SpikeView[]
  /** The day most of the list happened; a spike on another day says its day. */
  listDate: IsoDate
  linkStocks?: boolean
  /** Whether each stock has traded back to its spike (left out of the preview before posting). */
  status?: boolean
  actions?: (spike: SpikeView) => ReactNode
}) {
  const columns = 4 + (status ? 1 : 0) + (actions ? 1 : 0)
  const groups: { name: string | null; spikes: SpikeView[] }[] = []
  for (const s of spikes) {
    const last = groups.at(-1)
    if (last && last.name === s.group) last.spikes.push(s)
    else groups.push({ name: s.group, spikes: [s] })
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Spike</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Close</TableHead>
            <TableHead className="hidden text-right md:table-cell">To the spike</TableHead>
            {status && (
              <TableHead className="text-right">
                <span className="sm:hidden">Reached</span>
                <span className="hidden sm:inline">Reached again</span>
              </TableHead>
            )}
            {actions && (
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g, i) => [
            g.name ? (
              <TableRow key={`group-${String(i)}`} className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={columns} className="py-1.5 text-xs font-medium text-muted-foreground">
                  {g.name}
                </TableCell>
              </TableRow>
            ) : null,
            ...g.spikes.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {linkStocks ? (
                    <Link
                      href={`/members/stocks/${s.symbol}?chart=5d`}
                      className="rounded-sm font-mono font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {s.symbol}
                    </Link>
                  ) : (
                    <span className="font-mono font-medium">{s.symbol}</span>
                  )}
                  <span className="block text-xs whitespace-normal text-muted-foreground">
                    {describeSpikeTime(s)}
                    {s.date !== listDate ? `, ${formatShortDate(s.date)}` : ""}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="font-medium">{formatLevel(s.price)}</span>
                  {s.close !== null && (
                    <span className="block text-xs text-muted-foreground sm:hidden">close {formatLevel(s.close)}</span>
                  )}
                  {s.close !== null && (
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {formatPercent(spikeGap(s.price, s.close), { digits: 1 })}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatLevel(s.close)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {formatPercent(spikeGap(s.price, s.close), { digits: 1 })}
                </TableCell>
                {status && (
                  <TableCell className="text-right">
                    <SpikeStatus spike={s} />
                  </TableCell>
                )}
                {actions && <TableCell className="pl-0">{actions(s)}</TableCell>}
              </TableRow>
            )),
          ])}
        </TableBody>
      </Table>
    </div>
  )
}

/** HG's method for studying a spike, as he teaches it. */
export const SPIKE_STUDY_STEPS = [
  "Identify the channel that has gapped to the spike.",
  "Identify earlier times and patterns where a spike was relevant.",
  "Evaluate all the possible catalysts and data.",
  "Track how long it takes the stock to recover the spike price.",
  "Decide whether the spike is tied to a catalyst or an upcoming event (a lot of buying already), or is an isolated target of institutional traders.",
] as const
