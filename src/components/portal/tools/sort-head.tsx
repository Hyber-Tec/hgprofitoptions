"use client"

import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu"
import { cn } from "@/lib/utils"
import { TableHead } from "@/components/ui/table"

export interface SortState<K extends string> {
  key: K
  dir: 1 | -1
}

/** A sortable column header: click toggles ascending and descending. */
export function SortHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: K
  sort: SortState<K>
  onSort: (key: K) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? LuArrowUpDown : sort.dir === 1 ? LuArrowUp : LuArrowDown
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  )
}

export function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }
}

export function compareValues(a: number | string, b: number | string, dir: 1 | -1): number {
  return (typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b)) * dir
}
