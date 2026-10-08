"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type SubmitEvent } from "react"
import { LuSave } from "react-icons/lu"
import { createManualTrade, type ManualTradeInput } from "@/lib/actions/journal"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const toNumber = (v: string) => (v.trim() === "" ? null : Number(v))

export function ManualTradeForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({})
  const [kind, setKind] = useState<"stock" | "call" | "put">("call")
  const [direction, setDirection] = useState<"long" | "short">("long")
  const [closed, setClosed] = useState(false)
  const [form, setForm] = useState({
    symbol: "",
    strike: "",
    expiry: "",
    quantity: "1",
    entryPrice: "",
    fees: "0",
    openedAt: localNow(),
    exitPrice: "",
    closedAt: localNow(),
  })
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const error = (key: string) => errors[key]?.map((message) => ({ message }))

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input: ManualTradeInput = {
      symbol: form.symbol,
      assetType: kind === "stock" ? "stock" : "option",
      optionRight: kind === "stock" ? null : kind,
      strike: kind === "stock" ? null : toNumber(form.strike),
      expiry: kind === "stock" ? null : form.expiry || null,
      direction,
      quantity: Number(form.quantity),
      entryPrice: Number(form.entryPrice),
      fees: Number(form.fees || 0),
      openedAt: new Date(form.openedAt).toISOString(),
      exitPrice: closed ? toNumber(form.exitPrice) : null,
      closedAt: closed ? new Date(form.closedAt).toISOString() : null,
    }
    startTransition(async () => {
      const result = await createManualTrade(input)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.add({ title: "Trade not saved", description: result.message, type: "error" })
        return
      }
      toast.add({ title: "Trade added", type: "success" })
      router.push(`/members/journal/${result.data.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-8">
      <FieldSet>
        <FieldLegend>Contract</FieldLegend>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field data-invalid={Boolean(errors.symbol)}>
              <FieldLabel htmlFor="t-symbol">Ticker</FieldLabel>
              <Input
                id="t-symbol"
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase())}
                placeholder="TSM"
                autoCapitalize="characters"
                required
                aria-invalid={Boolean(errors.symbol)}
              />
              <FieldError errors={error("symbol")} />
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <ToggleGroup
                variant="outline"
                spacing={0}
                value={[kind]}
                onValueChange={(v: string[]) => v[0] && setKind(v[0] as typeof kind)}
                aria-label="Type"
              >
                <ToggleGroupItem value="call">Call</ToggleGroupItem>
                <ToggleGroupItem value="put">Put</ToggleGroupItem>
                <ToggleGroupItem value="stock">Shares</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>
          {kind !== "stock" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.strike)}>
                <FieldLabel htmlFor="t-strike">Strike</FieldLabel>
                <Input
                  id="t-strike"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={form.strike}
                  onChange={(e) => set("strike", e.target.value)}
                  required
                  aria-invalid={Boolean(errors.strike)}
                />
                <FieldError errors={error("strike")} />
              </Field>
              <Field data-invalid={Boolean(errors.expiry)}>
                <FieldLabel htmlFor="t-expiry">Expiry</FieldLabel>
                <Input
                  id="t-expiry"
                  type="date"
                  value={form.expiry}
                  onChange={(e) => set("expiry", e.target.value)}
                  required
                  aria-invalid={Boolean(errors.expiry)}
                />
                <FieldError errors={error("expiry")} />
              </Field>
            </div>
          )}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Entry</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel>Direction</FieldLabel>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[direction]}
              onValueChange={(v: string[]) => v[0] && setDirection(v[0] as typeof direction)}
              aria-label="Direction"
            >
              <ToggleGroupItem value="long">Bought (long)</ToggleGroupItem>
              <ToggleGroupItem value="short">Sold (short)</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={Boolean(errors.quantity)}>
              <FieldLabel htmlFor="t-qty">{kind === "stock" ? "Shares" : "Contracts"}</FieldLabel>
              <Input
                id="t-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                required
              />
              <FieldError errors={error("quantity")} />
            </Field>
            <Field data-invalid={Boolean(errors.entryPrice)}>
              <FieldLabel htmlFor="t-price">{kind === "stock" ? "Price" : "Premium"}</FieldLabel>
              <Input
                id="t-price"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.entryPrice}
                onChange={(e) => set("entryPrice", e.target.value)}
                required
              />
              <FieldError errors={error("entryPrice")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="t-fees">Fees</FieldLabel>
              <Input
                id="t-fees"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.fees}
                onChange={(e) => set("fees", e.target.value)}
              />
            </Field>
          </div>
          {kind !== "stock" && (
            <FieldDescription>
              Enter the premium per contract as quoted (for example 3.25). P&L uses 100 shares per contract.
            </FieldDescription>
          )}
          <Field className="sm:w-64">
            <FieldLabel htmlFor="t-opened">Opened</FieldLabel>
            <Input
              id="t-opened"
              type="datetime-local"
              value={form.openedAt}
              onChange={(e) => set("openedAt", e.target.value)}
              required
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend className="flex w-full items-center justify-between gap-4">
          Exit
          <label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={closed} onCheckedChange={setClosed} />
            Already closed
          </label>
        </FieldLegend>
        {closed && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.exitPrice)}>
              <FieldLabel htmlFor="t-exit">{kind === "stock" ? "Exit price" : "Exit premium"}</FieldLabel>
              <Input
                id="t-exit"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.exitPrice}
                onChange={(e) => set("exitPrice", e.target.value)}
                required
              />
              <FieldError errors={error("exitPrice")} />
            </Field>
            <Field data-invalid={Boolean(errors.closedAt)}>
              <FieldLabel htmlFor="t-closed">Closed</FieldLabel>
              <Input
                id="t-closed"
                type="datetime-local"
                value={form.closedAt}
                onChange={(e) => set("closedAt", e.target.value)}
                required
              />
              <FieldError errors={error("closedAt")} />
            </Field>
          </div>
        )}
      </FieldSet>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <LuSave />}
          Save trade
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
