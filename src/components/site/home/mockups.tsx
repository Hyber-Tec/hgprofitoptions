import type { ReactNode } from "react"
import { LuArrowUpRight, LuStar } from "react-icons/lu"
import { cn } from "@/lib/utils"
import { DEMO_ALERT, DEMO_JOURNAL_ENTRY, DEMO_LADDER, DEMO_SETUPS, DEMO_STOCK, DEMO_TARGETS, money } from "./demo-data"

/*
 * Small, static pictures of member-area screens, drawn with the app's own labels and demo data.
 * They are decoration: each composition that uses them is one labelled image for screen readers.
 */

export function MockCard({
  title,
  aside,
  className,
  children,
}: {
  title: string
  aside?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card/80 p-3.5 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-medium text-foreground">{title}</span>
        {aside && <span className="truncate text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

export function AlertMock() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-positive/12 px-1.5 py-0.5 text-[11px] font-medium text-positive">
          <LuArrowUpRight className="size-3" />
          {DEMO_ALERT.kind}
        </span>
        <span className="text-[10px] text-muted-foreground">{DEMO_ALERT.time}</span>
      </div>
      <p className="truncate font-mono text-[13px] text-foreground">{DEMO_ALERT.title}</p>
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        {[
          ["Buy point", DEMO_ALERT.buyPoint],
          ["Targets", DEMO_ALERT.targets],
          ["Stop", DEMO_ALERT.stop],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md bg-muted/70 px-2 py-1.5">
            <p className="text-muted-foreground">{label}</p>
            <p className="num mt-0.5 truncate font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const STATUS_STYLE: Record<(typeof DEMO_TARGETS)[number]["status"], string> = {
  Between: "bg-muted text-muted-foreground",
  "Above target": "bg-positive/12 text-positive",
  "Below break": "bg-negative/12 text-negative",
}

export function TargetsMock({ compact = false }: { compact?: boolean }) {
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="text-muted-foreground">
        <tr>
          <th className="pb-1.5 font-medium">Ticker</th>
          <th className="pb-1.5 font-medium">Target</th>
          <th className="pb-1.5 font-medium">Break of</th>
          {!compact && <th className="pb-1.5 font-medium">Put</th>}
          <th className="pb-1.5 text-right font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="num">
        {DEMO_TARGETS.map((row) => (
          <tr key={row.symbol} className="border-t">
            <td className="py-1.5 font-mono font-medium text-foreground">{row.symbol}</td>
            <td className="py-1.5">{money(row.target)}</td>
            <td className="py-1.5">{money(row.breakOf)}</td>
            {!compact && <td className="py-1.5">{money(row.put)}</td>}
            <td className="py-1.5 text-right">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
                  STATUS_STYLE[row.status],
                )}
              >
                {row.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A made-up 30-day path for DEMO that wanders between its channel lines and ends at the last close. */
const PRICE_PATH = [
  110.9, 111.8, 110.6, 109.9, 111.2, 112.7, 112.1, 113.6, 114.9, 114.2, 112.9, 113.4, 115.1, 116.3, 115.6, 114.8, 116.9,
  118.2, 117.5, 116.4, 115.9, 117.3, 119.1, 120.2, 119.4, 117.8, 116.9, 117.6, 118.9, 118.4,
]

/** `id` names the SVG gradient; each ladder on a page needs its own. */
export function LadderMock({ id, className }: { id: string; className?: string }) {
  const width = 300
  const height = 168
  const top = DEMO_LADDER[DEMO_LADDER.length - 1] ?? 0
  const bottom = DEMO_LADDER[0] ?? 0
  const pad = 4
  const y = (price: number) => pad + ((top - price) / (top - bottom)) * (height - pad * 2)
  const x = (i: number) => (i / (PRICE_PATH.length - 1)) * (width - 64)
  const line = PRICE_PATH.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ")
  const lastY = y(DEMO_STOCK.lastClose)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-auto w-full overflow-visible", className)}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {DEMO_LADDER.map((level, i) => (
        <g key={level}>
          <line
            x1={0}
            x2={width - 60}
            y1={y(level)}
            y2={y(level)}
            stroke="currentColor"
            className={level === DEMO_STOCK.lastClose ? "text-foreground/45" : "text-foreground/15"}
            strokeDasharray={level === DEMO_STOCK.lastClose ? undefined : "3 4"}
          />
          {/* BOC: halfway to the next line up. */}
          {i < DEMO_LADDER.length - 1 && (
            <line
              x1={0}
              x2={width - 60}
              y1={y(level + DEMO_STOCK.boc)}
              y2={y(level + DEMO_STOCK.boc)}
              stroke="var(--brand)"
              strokeOpacity="0.25"
              strokeDasharray="1 5"
            />
          )}
          <text x={width} y={y(level) + 3.5} textAnchor="end" className="num fill-muted-foreground text-[10px]">
            {money(level)}
          </text>
        </g>
      ))}
      <path d={`${line} L${x(PRICE_PATH.length - 1)},${height} L0,${height} Z`} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx={x(PRICE_PATH.length - 1)} cy={lastY} r="3.5" fill="var(--brand)" />
      <circle cx={x(PRICE_PATH.length - 1)} cy={lastY} r="7" fill="var(--brand)" fillOpacity="0.2" />
    </svg>
  )
}

/** A journal entry (plan, outcome, lesson) and, when `wide`, the setups logged this quarter. */
export function JournalMock({ wide = false }: { wide?: boolean }) {
  const entry = DEMO_JOURNAL_ENTRY
  const most = Math.max(...DEMO_SETUPS.map((setup) => setup.count))
  return (
    <div className={cn("grid gap-5", wide && "sm:grid-cols-2")}>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[12px] text-foreground">{entry.title}</span>
          <span className="shrink-0 rounded bg-brand/12 px-1.5 py-0.5 text-[10px] font-medium text-brand">
            {entry.setup}
          </span>
        </div>
        <dl className="grid gap-1.5 text-[11px]">
          {[
            ["Plan", entry.plan],
            ["Outcome", entry.outcome],
            ["Lesson", entry.lesson],
          ].map(([term, detail]) => (
            <div key={term} className="grid grid-cols-[4rem_1fr] gap-2">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Feeling: {entry.feeling}</span>
          <span className="flex gap-0.5 text-warning">
            {[1, 2, 3, 4, 5].map((star) => (
              <LuStar key={star} className="size-3" fill={star <= entry.rating ? "currentColor" : "none"} />
            ))}
          </span>
        </div>
      </div>
      {wide && (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[11px] font-medium text-foreground">Setups logged this quarter</p>
          {DEMO_SETUPS.map((setup) => (
            <div key={setup.label} className="grid grid-cols-[6.5rem_1fr_1.25rem] items-center gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{setup.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${(setup.count / most) * 100}%` }}
                />
              </span>
              <span className="num text-right text-foreground">{setup.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
