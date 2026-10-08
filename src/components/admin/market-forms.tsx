"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuPlus, LuSave, LuTrash2 } from "react-icons/lu"
import type { Route } from "next"
import { saveIndexValues, updateEtfConfig } from "@/lib/actions/admin/market"
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

const INDICES = [
  ["DJI", "Dow Jones"],
  ["SPX", "S&P 500"],
  ["IXIC", "Nasdaq"],
] as const
const FIELDS = [
  ["pfcp", "Prev. Fri close"],
  ["high", "High"],
  ["low", "Low"],
  ["close", "Close"],
] as const

export function IndexValuesForm({
  weekStart,
  initial,
}: {
  weekStart: string
  initial: Record<string, { pfcp: number; high: number; low: number; close: number } | undefined>
}) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      INDICES.map(([s]) => [s, Object.fromEntries(FIELDS.map(([f]) => [f, initial[s]?.[f].toString() ?? ""]))]),
    ),
  )
  const [pending, startTransition] = useTransition()
  const [loading, startLoading] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const set = (sym: string, field: string, value: string) =>
    setValues((v) => ({ ...v, [sym]: { ...v[sym], [field]: value } }))
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-2 text-left font-normal">Index</th>
              {FIELDS.map(([field, label]) => (
                <th key={field} className="pb-2 pl-2 text-left font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INDICES.map(([sym, name]) => (
              <tr key={sym}>
                <th scope="row" className="py-1 pr-2 text-left font-medium whitespace-nowrap">
                  {name} <span className="font-mono text-xs font-normal text-muted-foreground">{sym}</span>
                </th>
                {FIELDS.map(([field, label]) => (
                  <td key={field} className="py-1 pl-2">
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className="h-8 tabular-nums"
                      value={values[sym]?.[field] ?? ""}
                      onChange={(e) => set(sym, field, e.target.value)}
                      aria-label={`${name} ${label.toLowerCase()}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FieldDescription>Range and SVI are calculated for you, with the same sign rule as the stocks.</FieldDescription>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const payload = Object.fromEntries(
                INDICES.filter(([s]) => FIELDS.every(([f]) => (values[s]?.[f] ?? "") !== "")).map(([s]) => [
                  s,
                  {
                    pfcp: Number(values[s]?.pfcp),
                    high: Number(values[s]?.high),
                    low: Number(values[s]?.low),
                    close: Number(values[s]?.close),
                  },
                ]),
              )
              done(await saveIndexValues(weekStart, payload), "Index values saved")
            })
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save index values
        </Button>
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
