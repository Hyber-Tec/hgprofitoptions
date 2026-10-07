"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react"
import { formatLevel, formatPercent } from "@/core/format"
import { cn } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type LevelKind = "line" | "anchor" | "boc" | "median" | "fs" | "ss" | "target" | "break" | "put"

export interface LadderLevel {
  value: number
  kind: LevelKind
  label: string
}

type Layer = "lines" | "boc" | "medians" | "marks" | "targets"

const LAYER_OF: Record<LevelKind, Layer> = {
  line: "lines",
  anchor: "lines",
  boc: "boc",
  median: "medians",
  fs: "marks",
  ss: "marks",
  target: "targets",
  break: "targets",
  put: "targets",
}
const LAYERS: { value: Layer; label: string }[] = [
  { value: "lines", label: "Lines" },
  { value: "boc", label: "BOC" },
  { value: "medians", label: "Medians" },
  { value: "marks", label: "FS / SS" },
  { value: "targets", label: "Targets" },
]

const HEIGHT = 440
const PAD = { top: 18, bottom: 18, left: 96, right: 84 }

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(320, Math.round(entry.contentRect.width)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/**
 * HG's channel ladder for one stock: channel lines around the last close, BOC levels, the
 * 5/30/90-day medians, FS and SS levels and the current strike target. Hover to read any level.
 */
export function ChannelLadder({ price, levels }: { price: number; levels: LadderLevel[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [layers, setLayers] = useState<Layer[]>(["lines", "boc", "medians", "marks", "targets"])
  const [hover, setHover] = useState<number | null>(null)
  const visible = useMemo(() => levels.filter((l) => layers.includes(LAYER_OF[l.kind])), [levels, layers])

  const [min, max] = useMemo(() => {
    const values = [price, ...visible.map((l) => l.value)]
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo) * 0.04 || price * 0.02
    return [lo - pad, hi + pad]
  }, [price, visible])

  const y = (v: number) => PAD.top + ((max - v) / (max - min)) * (HEIGHT - PAD.top - PAD.bottom)
  const valueAt = (py: number) => max - ((py - PAD.top) / (HEIGHT - PAD.top - PAD.bottom)) * (max - min)
  const right = width - PAD.right

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const py = event.clientY - box.top
    setHover(py >= PAD.top && py <= HEIGHT - PAD.bottom ? valueAt(py) : null)
  }

  const lineLevels = visible.filter((l) => l.kind === "line" || l.kind === "anchor")
  const bocLevels = visible.filter((l) => l.kind === "boc")
  const leftMarks = visible.filter((l) => l.kind === "median" || l.kind === "fs" || l.kind === "ss")
  const targetMarks = visible.filter((l) => l.kind === "target" || l.kind === "break" || l.kind === "put")
  const nearest =
    hover === null ? null : [...visible].sort((a, b) => Math.abs(a.value - hover) - Math.abs(b.value - hover))[0]

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        multiple
        value={layers}
        onValueChange={(v: string[]) => setLayers(v as Layer[])}
        aria-label="Layers"
        className="flex-wrap"
      >
        {LAYERS.map((l) => (
          <ToggleGroupItem key={l.value} value={l.value}>
            {l.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div ref={ref} className="w-full">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-none select-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Channel ladder chart. The table below lists every level."
        >
          {/* Main channel lines */}
          {lineLevels.map((l) => (
            <g key={`line-${l.value}`}>
              <line
                x1={PAD.left}
                x2={right}
                y1={y(l.value)}
                y2={y(l.value)}
                className={l.kind === "anchor" ? "stroke-foreground/60" : "stroke-muted-foreground/45"}
                strokeWidth={l.kind === "anchor" ? 1.5 : 1}
              />
              <text
                x={right + 8}
                y={y(l.value)}
                dominantBaseline="middle"
                className={cn(
                  "fill-muted-foreground text-[11px] tabular-nums",
                  l.kind === "anchor" && "fill-foreground font-medium",
                )}
              >
                {formatLevel(l.value)}
              </text>
            </g>
          ))}
          {/* BOC levels */}
          {bocLevels.map((l) => (
            <g key={`boc-${l.value}`}>
              <line
                x1={PAD.left + 24}
                x2={right - 24}
                y1={y(l.value)}
                y2={y(l.value)}
                className="stroke-muted-foreground/30"
                strokeDasharray="3 5"
                strokeWidth={1}
              />
              <text
                x={right + 8}
                y={y(l.value)}
                dominantBaseline="middle"
                className="fill-muted-foreground/70 text-[10px] tabular-nums"
              >
                {formatLevel(l.value)}
              </text>
            </g>
          ))}
          {/* Medians and FS/SS on the left */}
          {leftMarks.map((l) => {
            const tone = l.kind === "median" ? "fill-warning" : l.kind === "fs" ? "fill-positive" : "fill-negative"
            return (
              <g key={`${l.kind}-${l.label}-${l.value}`}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + 18}
                  y1={y(l.value)}
                  y2={y(l.value)}
                  className={
                    l.kind === "median" ? "stroke-warning" : l.kind === "fs" ? "stroke-positive" : "stroke-negative"
                  }
                  strokeWidth={2}
                />
                <text
                  x={PAD.left - 6}
                  y={y(l.value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={cn("text-[10.5px] tabular-nums", tone)}
                >
                  {l.label} {formatLevel(l.value)}
                </text>
              </g>
            )
          })}
          {/* Strike target levels on the right edge */}
          {targetMarks.map((l) => (
            <g key={`${l.kind}-${l.value}`}>
              <line
                x1={right - 18}
                x2={right}
                y1={y(l.value)}
                y2={y(l.value)}
                className="stroke-foreground"
                strokeWidth={2}
              />
              <text
                x={right - 22}
                y={y(l.value)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-foreground text-[10.5px] font-medium"
              >
                {l.label}
              </text>
            </g>
          ))}
          {/* Price */}
          <line x1={PAD.left} x2={right} y1={y(price)} y2={y(price)} className="stroke-foreground" strokeWidth={2} />
          <g transform={`translate(${(PAD.left + right) / 2}, ${y(price)})`}>
            <rect x={-46} y={-10} width={92} height={20} rx={10} className="fill-foreground" />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-background text-[11px] font-semibold tabular-nums"
            >
              Price {formatLevel(price)}
            </text>
          </g>
          {/* Hover read-out */}
          {hover !== null && (
            <g pointerEvents="none">
              <line
                x1={PAD.left}
                x2={right}
                y1={y(hover)}
                y2={y(hover)}
                className="stroke-ring"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
              <rect
                x={right + 4}
                y={y(hover) - 10}
                width={PAD.right - 6}
                height={20}
                rx={4}
                className="fill-popover stroke-border"
              />
              <text
                x={right + 8}
                y={y(hover)}
                dominantBaseline="central"
                className="fill-popover-foreground text-[11px] tabular-nums"
              >
                {formatLevel(hover)}
              </text>
            </g>
          )}
        </svg>
      </div>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {nearest && hover !== null ? (
          <>
            Nearest: <span className="font-medium text-foreground">{nearest.label}</span> at{" "}
            <span className="tabular-nums">{formatLevel(nearest.value)}</span> (
            {formatPercent((nearest.value - price) / price, { digits: 1 })} from price)
          </>
        ) : (
          "Hover the ladder to read a level."
        )}
      </p>
    </div>
  )
}

/** Every level of the ladder as a table, for screen readers and exact values. */
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
