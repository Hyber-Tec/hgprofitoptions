"use client"

import { useState, useTransition } from "react"
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu"
import { deleteFaq, deleteTestimonial, saveFaq, saveTestimonial } from "@/lib/actions/admin/content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ToneBadge } from "@/components/portal/display"
import { useEditorDialog } from "./use-editor-dialog"

type Result = { ok: true } | { ok: false; message: string }
function done(result: Result, success: string): boolean {
  toast.add(
    result.ok
      ? { title: success, type: "success" }
      : { title: "Not saved", description: result.message, type: "error" },
  )
  return result.ok
}

// ---- Testimonials -----------------------------------------------------------------------------

export interface TestimonialRow {
  id: string
  name: string
  location: string
  avatar: string | null
  flag: string | null
  quote: string
  trade: {
    symbol: string
    type: "call" | "put"
    strike: number
    expiryLabel: string
    realizedProfit: number
    currency: string
    percentGain: number
  } | null
  published: boolean
  order: number
}

const blankTestimonial = (order: number) => ({
  name: "",
  location: "",
  avatar: "",
  flag: "",
  quote: "",
  hasTrade: true,
  symbol: "",
  type: "call" as "call" | "put",
  strike: "",
  expiryLabel: "",
  realizedProfit: "",
  currency: "USD",
  percentGain: "",
  published: true,
  order: String(order),
})

export function TestimonialsManager({ items }: { items: TestimonialRow[] }) {
  const dialog = useEditorDialog<string>()
  const [form, setForm] = useState(blankTestimonial(items.length + 1))
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }))

  const open = (item: TestimonialRow | null) => {
    if (item === null) {
      setForm(blankTestimonial(items.length + 1))
      dialog.show(null)
      return
    }
    setForm({
      name: item.name,
      location: item.location,
      avatar: item.avatar ?? "",
      flag: item.flag ?? "",
      quote: item.quote,
      hasTrade: item.trade !== null,
      symbol: item.trade?.symbol ?? "",
      type: item.trade?.type ?? "call",
      strike: String(item.trade?.strike ?? ""),
      expiryLabel: item.trade?.expiryLabel ?? "",
      realizedProfit: String(item.trade?.realizedProfit ?? ""),
      currency: item.trade?.currency ?? "USD",
      percentGain: item.trade ? String(Math.round(item.trade.percentGain * 10000) / 100) : "",
      published: item.published,
      order: String(item.order),
    })
    dialog.show(item.id)
  }
  const save = () =>
    startTransition(async () => {
      const result = await saveTestimonial(dialog.target, {
        name: form.name,
        location: form.location,
        avatar: form.avatar,
        flag: form.flag,
        quote: form.quote,
        trade: form.hasTrade
          ? {
              symbol: form.symbol,
              type: form.type,
              strike: Number(form.strike),
              expiryLabel: form.expiryLabel,
              realizedProfit: Number(form.realizedProfit),
              currency: form.currency || "USD",
              percentGain: Number(form.percentGain) / 100,
            }
          : null,
        published: form.published,
        order: Number(form.order) || 0,
      })
      if (done(result.ok ? { ok: true } : result, "Testimonial saved")) dialog.close()
    })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" onClick={() => open(null)}>
          <LuPlus />
          Add testimonial
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {t.name} <span className="text-sm font-normal text-muted-foreground">· {t.location}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  #{t.order}
                  {t.trade &&
                    ` · ${t.trade.symbol} ${t.trade.type} ${t.trade.strike}, +${Math.round(t.trade.percentGain * 100)}%`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!t.published && <ToneBadge tone="muted">Hidden</ToneBadge>}
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => open(t)}>
                  <LuPencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${t.name}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => void done(await deleteTestimonial(t.id), "Testimonial deleted"))
                  }
                >
                  <LuTrash2 />
                </Button>
              </div>
            </div>
            <p className="line-clamp-3 text-sm text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
          </li>
        ))}
      </ul>
      <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialog.target === null ? "Add testimonial" : "Edit testimonial"}</DialogTitle>
            <DialogDescription>Shown on the home page. Keep members&apos; words as they wrote them.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="t-name">Name</FieldLabel>
                <Input
                  id="t-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Joey D."
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-location">Location</FieldLabel>
                <Input
                  id="t-location"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Texas"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-avatar">Photo path</FieldLabel>
                <Input
                  id="t-avatar"
                  value={form.avatar}
                  onChange={(e) => set("avatar", e.target.value)}
                  placeholder="/media/testimonials/joey.webp"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-flag">Country flag</FieldLabel>
                <Input
                  id="t-flag"
                  value={form.flag}
                  onChange={(e) => set("flag", e.target.value.toUpperCase())}
                  placeholder="US"
                  maxLength={2}
                />
                <FieldDescription>Used when there is no photo.</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="t-quote">Quote</FieldLabel>
              <Textarea id="t-quote" rows={4} value={form.quote} onChange={(e) => set("quote", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.hasTrade} onCheckedChange={(v) => set("hasTrade", v)} />
              Show a trade card
            </label>
            {form.hasTrade && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="t-symbol">Ticker</FieldLabel>
                  <Input
                    id="t-symbol"
                    value={form.symbol}
                    onChange={(e) => set("symbol", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={[form.type]}
                    onValueChange={(v: string[]) => v[0] && set("type", v[0])}
                  >
                    <ToggleGroupItem value="call">Call</ToggleGroupItem>
                    <ToggleGroupItem value="put">Put</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-strike">Strike</FieldLabel>
                  <Input
                    id="t-strike"
                    type="number"
                    step="any"
                    value={form.strike}
                    onChange={(e) => set("strike", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-exp">Expiry</FieldLabel>
                  <Input
                    id="t-exp"
                    value={form.expiryLabel}
                    onChange={(e) => set("expiryLabel", e.target.value)}
                    placeholder="10/17"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-profit">Profit</FieldLabel>
                  <Input
                    id="t-profit"
                    type="number"
                    step="any"
                    value={form.realizedProfit}
                    onChange={(e) => set("realizedProfit", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-gain">Gain %</FieldLabel>
                  <Input
                    id="t-gain"
                    type="number"
                    step="any"
                    value={form.percentGain}
                    onChange={(e) => set("percentGain", e.target.value)}
                  />
                </Field>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <Field className="w-24">
                <FieldLabel htmlFor="t-order">Order</FieldLabel>
                <Input id="t-order" type="number" value={form.order} onChange={(e) => set("order", e.target.value)} />
              </Field>
              <label className="mt-5 flex items-center gap-2 text-sm">
                <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
                Visible on the site
              </label>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={dialog.close}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---- FAQ --------------------------------------------------------------------------------------

export interface FaqRow {
  id: string
  group: string
  question: string
  subtitle: string | null
  answer: string[]
  published: boolean
  order: number
}

export function FaqManager({ items, groups }: { items: FaqRow[]; groups: string[] }) {
  const dialog = useEditorDialog<string>()
  const [form, setForm] = useState({
    group: groups[0] ?? "",
    question: "",
    subtitle: "",
    answer: "",
    published: true,
    order: "1",
  })
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }))

  const open = (item: FaqRow | null) => {
    if (item === null) {
      setForm({
        group: groups[0] ?? "",
        question: "",
        subtitle: "",
        answer: "",
        published: true,
        order: String(items.length + 1),
      })
      dialog.show(null)
      return
    }
    setForm({
      group: item.group,
      question: item.question,
      subtitle: item.subtitle ?? "",
      answer: item.answer.join("\n\n"),
      published: item.published,
      order: String(item.order),
    })
    dialog.show(item.id)
  }
  const save = () =>
    startTransition(async () => {
      const result = await saveFaq(dialog.target, {
        group: form.group,
        question: form.question,
        subtitle: form.subtitle,
        answer: form.answer
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
        published: form.published,
        order: Number(form.order) || 0,
      })
      if (done(result.ok ? { ok: true } : result, "Question saved")) dialog.close()
    })

  const allGroups = [...new Set([...groups, ...items.map((i) => i.group)])]
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button size="sm" onClick={() => open(null)}>
          <LuPlus />
          Add question
        </Button>
      </div>
      {allGroups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{group}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {items
              .filter((i) => i.group === group)
              .sort((a, b) => a.order - b.order)
              .map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {f.question}
                      {!f.published && <ToneBadge tone="muted">Hidden</ToneBadge>}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{f.answer.join(" ")}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${f.question}`} onClick={() => open(f)}>
                      <LuPencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${f.question}`}
                      disabled={pending}
                      onClick={() => startTransition(async () => void done(await deleteFaq(f.id), "Question deleted"))}
                    >
                      <LuTrash2 />
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialog.target === null ? "Add question" : "Edit question"}</DialogTitle>
            <DialogDescription>Shown on the FAQ page. Separate paragraphs with a blank line.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
              <Field>
                <FieldLabel htmlFor="q-group">Group</FieldLabel>
                <Input
                  id="q-group"
                  list="faq-groups"
                  value={form.group}
                  onChange={(e) => set("group", e.target.value)}
                />
                <datalist id="faq-groups">
                  {allGroups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </Field>
              <Field>
                <FieldLabel htmlFor="q-order">Order</FieldLabel>
                <Input id="q-order" type="number" value={form.order} onChange={(e) => set("order", e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="q-question">Question</FieldLabel>
              <Input id="q-question" value={form.question} onChange={(e) => set("question", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="q-subtitle">Subtitle (optional)</FieldLabel>
              <Input id="q-subtitle" value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="q-answer">Answer</FieldLabel>
              <Textarea id="q-answer" rows={6} value={form.answer} onChange={(e) => set("answer", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
              Visible on the site
            </label>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={dialog.close}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
