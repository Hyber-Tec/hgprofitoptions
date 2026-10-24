"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { LuPlus, LuRefreshCw, LuRotateCcw, LuSave, LuTrash2 } from "react-icons/lu"
import type { Route } from "next"
import { addDays } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { INDEX_NAMES, INDEX_SYMBOLS, type IndexSymbol } from "@/core/indices"
import {
  clearIndexValues,
  requestMarketSync,
  saveIndexValues,
  updateEtfConfig,
  type IndexValuesInput,
} from "@/lib/actions/admin/market"
import { ToneBadge } from "@/components/portal/display"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

type Result = { ok: true } | { ok: false; message: string }
function done(result: Result, success: string) {
  toast.add(
    result.ok
      ? { title: success, type: "success" }
      : { title: "Not saved", description: result.message, type: "error" },
  )
}

type IndexField = "close" | "pfcp" | "high" | "highAt" | "low" | "lowAt"

export interface IndexValuesInitial {
  pfcp: number
  high: number
  low: number
  close: number
  highAt: string | null
  lowAt: string | null
  entered: boolean
}

/** "2026-10-21T12:30" in New York, for a datetime-local field, from an ISO instant. */
function localInput(iso: string | null): string {
  if (!iso) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`
}

const signed = (n: number) =>
  `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`

/**
 * HG's weekly close of each index: close, last Friday's close, and the week's high and low with when they
 * happened. Market data fills these in after the close; what is typed here wins over it for that week.
 */
export function IndexValuesForm({
  weekStart,
  initial,
  connected,
}: {
  weekStart: string
  initial: Partial<Record<IndexSymbol, IndexValuesInitial>>
  connected: boolean
}) {
  const [values, setValues] = useState<Record<IndexSymbol, Record<IndexField, string>>>(() => {
    const out = {} as Record<IndexSymbol, Record<IndexField, string>>
    for (const sym of INDEX_SYMBOLS) {
      const row = initial[sym]
      out[sym] = {
        close: row?.close.toString() ?? "",
        pfcp: row?.pfcp.toString() ?? "",
        high: row?.high.toString() ?? "",
        highAt: localInput(row?.highAt ?? null),
        low: row?.low.toString() ?? "",
        lowAt: localInput(row?.lowAt ?? null),
      }
    }
    return out
  })
  const [pending, startTransition] = useTransition()
  const [loading, startLoading] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const set = (sym: IndexSymbol, field: IndexField, value: string) =>
    setValues((v) => ({ ...v, [sym]: { ...v[sym], [field]: value } }))
  const typed = INDEX_SYMBOLS.filter((sym) => initial[sym]?.entered)
  const weekEnd = addDays(weekStart as IsoDate, 4)
  return (
    <FieldGroup>
      <Field className="sm:max-w-56">
        <FieldLabel htmlFor="w-start">Week</FieldLabel>
        <Input
          id="w-start"
          type="date"
          defaultValue={weekStart}
          disabled={loading}
          onChange={(e) =>
            e.target.value && startLoading(() => router.replace(`${pathname}?week=${e.target.value}` as Route))
          }
        />
        <FieldDescription>Any day in the week works.</FieldDescription>
      </Field>
      <div className="flex flex-col gap-3">
        {INDEX_SYMBOLS.map((sym) => {
          const v = values[sym]
          const gap = v.close !== "" && v.pfcp !== "" ? Number(v.close) - Number(v.pfcp) : null
          const row = initial[sym]
          const id = (field: string) => `i-${sym}-${field}`
          return (
            <fieldset key={sym} className="flex flex-col gap-3 rounded-lg border p-3">
              <legend className="sr-only">{INDEX_NAMES[sym]}</legend>
              <p className="flex items-center justify-between gap-2 text-sm font-medium">
                {INDEX_NAMES[sym]}
                {row && (
                  <ToneBadge tone={row.entered ? "neutral" : "muted"}>
                    {row.entered ? "Typed in" : "From market data"}
                  </ToneBadge>
                )}
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))_repeat(2,minmax(0,1fr)_minmax(0,1.4fr))]">
                <Field>
                  <FieldLabel htmlFor={id("close")}>Close</FieldLabel>
                  <Input
                    id={id("close")}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={v.close}
                    onChange={(e) => set(sym, "close", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("pfcp")}>Last Friday&apos;s close</FieldLabel>
                  <Input
                    id={id("pfcp")}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={v.pfcp}
                    onChange={(e) => set(sym, "pfcp", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("high")}>Week high</FieldLabel>
                  <Input
                    id={id("high")}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={v.high}
                    onChange={(e) => set(sym, "high", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("highAt")}>When</FieldLabel>
                  <Input
                    id={id("highAt")}
                    type="datetime-local"
                    min={`${weekStart}T09:30`}
                    max={`${weekEnd}T16:00`}
                    value={v.highAt}
                    onChange={(e) => set(sym, "highAt", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("low")}>Week low</FieldLabel>
                  <Input
                    id={id("low")}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={v.low}
                    onChange={(e) => set(sym, "low", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("lowAt")}>When</FieldLabel>
                  <Input
                    id={id("lowAt")}
                    type="datetime-local"
                    min={`${weekStart}T09:30`}
                    max={`${weekEnd}T16:00`}
                    value={v.lowAt}
                    onChange={(e) => set(sym, "lowAt", e.target.value)}
                  />
                </Field>
              </div>
              <p className="text-sm text-muted-foreground">
                Gap vs last Friday:{" "}
                <span className="font-medium text-foreground tabular-nums">{gap === null ? "-" : signed(gap)}</span>
              </p>
            </fieldset>
          )
        })}
      </div>
      <FieldDescription>
        Times are New York time. Range and SVI are calculated for you, with the same sign rule as the stocks.
        {connected ? " Values you save here stay, even after market data updates." : ""}
      </FieldDescription>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const payload: Partial<Record<IndexSymbol, IndexValuesInput>> = {}
              for (const sym of INDEX_SYMBOLS) {
                const v = values[sym]
                if (v.close === "" || v.pfcp === "" || v.high === "" || v.low === "") continue
                payload[sym] = {
                  pfcp: Number(v.pfcp),
                  high: Number(v.high),
                  low: Number(v.low),
                  close: Number(v.close),
                  highAt: v.highAt || null,
                  lowAt: v.lowAt || null,
                }
              }
              done(await saveIndexValues(weekStart, payload), "Index values saved")
            })
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save index values
        </Button>
        {connected && typed.length > 0 && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () =>
                done(await clearIndexValues(weekStart), "Typed-in values removed: market data fills them in"),
              )
            }
          >
            <LuRotateCcw />
            Use market data instead
          </Button>
        )}
      </div>
    </FieldGroup>
  )
}

interface PairRow {
  underlying: string
  etf: string
  leverage: string
  direction: "bull" | "bear"
  issuer: string
}

export function EtfEditor({
  initial,
}: {
  initial: {
    guidance: string[]
    pairs: { underlying: string; etf: string; leverage: number; direction: "bull" | "bear"; issuer: string | null }[]
  }
}) {
  const [guidance, setGuidance] = useState(initial.guidance.join("\n\n"))
  const [pairs, setPairs] = useState<PairRow[]>(
    initial.pairs.map((p) => ({ ...p, leverage: String(p.leverage), issuer: p.issuer ?? "" })),
  )
  const [pending, startTransition] = useTransition()
  const set = (i: number, patch: Partial<PairRow>) =>
    setPairs((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="etf-guidance">Guidance shown above the table</FieldLabel>
        <Textarea id="etf-guidance" rows={5} value={guidance} onChange={(e) => setGuidance(e.target.value)} />
        <FieldDescription>Separate paragraphs with a blank line.</FieldDescription>
      </Field>
      <div className="flex flex-col gap-2">
        <div className="hidden grid-cols-[7rem_7rem_6rem_minmax(0,16rem)_auto] gap-2 px-1 text-xs text-muted-foreground sm:grid">
          <span>Stock</span>
          <span>2x ETF</span>
          <span>Leverage</span>
          <span>Issuer (optional)</span>
          <span className="w-8" />
        </div>
        {pairs.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_4.5rem_auto] items-center gap-2 max-sm:border-b max-sm:pb-3 sm:grid-cols-[7rem_7rem_6rem_minmax(0,16rem)_auto]"
          >
            <Input
              className="h-8 font-mono uppercase"
              value={p.underlying}
              onChange={(e) => set(i, { underlying: e.target.value.toUpperCase() })}
              placeholder="Stock"
              aria-label="Stock"
            />
            <Input
              className="h-8 font-mono uppercase"
              value={p.etf}
              onChange={(e) => set(i, { etf: e.target.value.toUpperCase() })}
              placeholder="ETF"
              aria-label="ETF"
            />
            <Input
              className="h-8"
              type="number"
              step="0.5"
              value={p.leverage}
              onChange={(e) => set(i, { leverage: e.target.value })}
              aria-label="Leverage"
            />
            <Input
              className="h-8 max-sm:order-last max-sm:col-span-3"
              value={p.issuer}
              onChange={(e) => set(i, { issuer: e.target.value })}
              placeholder="Issuer (optional)"
              aria-label="Issuer"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove pair"
              onClick={() => setPairs((list) => list.filter((_, j) => j !== i))}
            >
              <LuTrash2 />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPairs((list) => [...list, { underlying: "", etf: "", leverage: "2", direction: "bull", issuer: "" }])
            }
          >
            <LuPlus />
            Add pair
          </Button>
        </div>
      </div>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () =>
              done(
                await updateEtfConfig({
                  guidance: guidance
                    .split(/\n\s*\n/)
                    .map((p) => p.trim())
                    .filter(Boolean),
                  pairs: pairs
                    .filter((p) => p.underlying && p.etf)
                    .map((p) => ({
                      underlying: p.underlying,
                      etf: p.etf,
                      leverage: Number(p.leverage) || 2,
                      direction: p.direction,
                      issuer: p.issuer.trim() || null,
                    })),
                }),
                "Leveraged ETF guide saved",
              ),
            )
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save
        </Button>
      </div>
    </FieldGroup>
  )
}

/**
 * "Update now": brings the market data up to date (missed sessions, new tickers' history, Key Market Data
 * and the indexes). While it runs, the page refreshes itself to show when it is done.
 */
export function MarketSyncButton({ running, connected }: { running: boolean; connected: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => router.refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [running, router])
  return (
    <Button
      disabled={!connected || running || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await requestMarketSync()
          if (!result.ok) done(result, "")
        })
      }
    >
      {running || pending ? <Spinner /> : <LuRefreshCw />}
      {running ? "Updating" : "Update now"}
    </Button>
  )
}
