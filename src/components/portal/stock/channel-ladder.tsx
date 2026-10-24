import { formatLevel, formatPercent } from "@/core/format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type LevelKind = "line" | "anchor" | "boc" | "median" | "fs" | "ss" | "target" | "break" | "put" | "spike"

export interface LadderLevel {
  value: number
  kind: LevelKind
  label: string
}

/** Every level around a stock (channel lines, BOC, medians, FS and SS, HG's levels) with its distance from the price. */
export function LadderTable({ price, levels }: { price: number; levels: LadderLevel[] }) {
  const sorted = [...levels].sort((a, b) => b.value - a.value)
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Level</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">From price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((l) => (
            <TableRow key={`${l.kind}-${l.label}-${l.value}`}>
              <TableCell className={l.kind === "anchor" ? "font-medium" : undefined}>{l.label}</TableCell>
              <TableCell className="text-right tabular-nums">{formatLevel(l.value)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatPercent((l.value - price) / price, { digits: 1 })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
