"use client"

import { ref, uploadBytes } from "firebase/storage"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"
import { LuCalendarClock, LuImagePlus, LuSave, LuSend, LuX } from "react-icons/lu"
import { ALERT_KINDS, ALERT_KIND_LABEL, alertNotification, defaultAlertTitle, type AlertFields } from "@/core/alerts"
import type { AlertKind } from "@/core/domain/types"
import { formatExpiry, formatLevel } from "@/core/format"
import { publishAlertAction, saveAlertDraft, type AlertDraftInput } from "@/lib/actions/admin/alerts"
import { clientStorage } from "@/lib/firebase/client-storage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AlertCard } from "@/components/portal/alerts/alert-card"

export interface TargetOption {
  symbol: string
  target: number
  breakLevel: number
  putStrike: number
  expiry: string
}

export interface ComposerInitial {
  id: string | null
  kind: AlertKind
  symbol: string
  instrument: "stock" | "call" | "put"
  strike: string
  expiry: string
  buyLow: string
  buyHigh: string
  sellPoints: [string, string, string]
  stop: string
  title: string
  body: string
  imagePath: string | null
  sendEmail: boolean
}

const num = (v: string) => (v.trim() === "" ? null : Number(v))
const NONE = "__none__"

export function AlertComposer({
  initial,
  symbols,
  targets,
  emailAvailable,
}: {
  initial: ComposerInitial
  symbols: string[]
  targets: TargetOption[]
  emailAvailable: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [id, setId] = useState(initial.id)
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({})
  const [schedule, setSchedule] = useState(false)
  const [publishAt, setPublishAt] = useState("")
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const set = <K extends keyof ComposerInitial>(key: K, value: ComposerInitial[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const targetItems = useMemo(
    () => [
      { value: NONE, label: "Prefill from a strike target" },
      ...targets.map((t) => ({
        value: t.symbol,
        label: `${t.symbol} · target ${formatLevel(t.target)}, break ${formatLevel(t.breakLevel)}, put ${formatLevel(t.putStrike)} ${formatExpiry(t.expiry as never)}`,
      })),
    ],
    [targets],
  )

  const fields: AlertFields = {
    kind: form.kind,
    symbol: form.symbol.trim().toUpperCase() || null,
    assetType: form.kind === "info" && !form.symbol ? null : form.instrument === "stock" ? "stock" : "option",
    optionRight: form.instrument === "stock" ? null : form.instrument,
    strike: form.instrument === "stock" ? null : num(form.strike),
    expiry: form.instrument === "stock" ? null : form.expiry || null,
    buyLow: num(form.buyLow),
    buyHigh: num(form.buyHigh) ?? num(form.buyLow),
    sellPoints: form.sellPoints.map(num).filter((v): v is number => v !== null),
    stop: num(form.stop),
  }
  const title = form.title.trim() || (fields.symbol || form.kind === "info" ? defaultAlertTitle(fields) : "New alert")
  const preview = alertNotification({ ...fields, title, body: form.body })

  const input = (): AlertDraftInput => ({
    ...fields,
    sellPoints: [...fields.sellPoints],
    title: form.title,
    body: form.body,
    imagePath: form.imagePath,
    targetEntrySymbol: fields.symbol,
    sendEmail: form.sendEmail && emailAvailable,
  })

  const prefill = (symbol: string) => {
    const t = targets.find((x) => x.symbol === symbol)
    if (!t) return
    setForm((f) => ({
      ...f,
      kind: "buy",
      symbol: t.symbol,
      instrument: "call",
      strike: String(t.target),
      expiry: t.expiry,
      title: "",
    }))
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
      toast.add({ title: "Use a PNG, JPG, WebP or GIF under 10 MB", type: "error" })
      return
    }
    setUploading(true)
    try {
      const path = `alerts/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-").slice(-80)}`
      await uploadBytes(ref(clientStorage(), path), file, { contentType: file.type })
      set("imagePath", path)
    } catch {
      toast.add({ title: "Upload failed", description: "Sign in again and retry.", type: "error" })
    } finally {
      setUploading(false)
    }
  }

  const save = (thenPublish: boolean) =>
    startTransition(async () => {
      const saved = await saveAlertDraft(input(), id)
      if (!saved.ok) {
        setErrors(saved.fieldErrors ?? {})
        toast.add({ title: "Not saved", description: saved.message, type: "error" })
        return
      }
      setErrors({})
      setId(saved.data.id)
      if (!thenPublish) {
        toast.add({ title: "Draft saved", type: "success" })
        router.replace(`/admin/alerts/${saved.data.id}`)
        return
      }
      const published = await publishAlertAction(
        saved.data.id,
        schedule && publishAt ? new Date(publishAt).toISOString() : null,
      )
      if (!published.ok) {
        toast.add({ title: "Not published", description: published.message, type: "error" })
        return
      }
      toast.add({
        title: schedule ? "Alert scheduled" : "Alert published",
        description: schedule ? "It goes out at the time you picked." : "Members are being notified now.",
        type: "success",
      })
      router.push(`/admin/alerts/${saved.data.id}`)
    })

  const err = (key: string) => errors[key]?.map((message) => ({ message }))

  return (
    <div className="grid gap-6 pb-24 xl:grid-cols-[minmax(0,1fr)_24rem] xl:pb-0">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>What and which contract</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Kind</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[form.kind]}
                  onValueChange={(v: string[]) => v[0] && set("kind", v[0] as AlertKind)}
                  aria-label="Kind"
                  className="flex-wrap"
                >
                  {ALERT_KINDS.map((k) => (
                    <ToggleGroupItem key={k} value={k} className="h-10 px-4">
                      {ALERT_KIND_LABEL[k]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              {targets.length > 0 && (
                <Field>
                  <FieldLabel>Strike target</FieldLabel>
                  <Select
                    items={targetItems}
                    value={NONE}
                    onValueChange={(v: string | null) => v && v !== NONE && prefill(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {targetItems.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Fills in the ticker, a call at the target strike and the expiry.</FieldDescription>
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <Field data-invalid={Boolean(errors.symbol)}>
                  <FieldLabel htmlFor="a-symbol">Ticker</FieldLabel>
                  <Input
                    id="a-symbol"
                    list="alert-symbols"
                    value={form.symbol}
                    onChange={(e) => set("symbol", e.target.value.toUpperCase())}
                    placeholder="TSM"
                    className="h-10 font-mono uppercase"
                    autoCapitalize="characters"
                  />
                  <datalist id="alert-symbols">
                    {symbols.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <FieldError errors={err("symbol")} />
                </Field>
                <Field>
                  <FieldLabel>Instrument</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    value={[form.instrument]}
                    onValueChange={(v: string[]) => v[0] && set("instrument", v[0] as ComposerInitial["instrument"])}
                    aria-label="Instrument"
                  >
                    <ToggleGroupItem value="call" className="h-10 px-4">
                      Call
                    </ToggleGroupItem>
                    <ToggleGroupItem value="put" className="h-10 px-4">
                      Put
                    </ToggleGroupItem>
                    <ToggleGroupItem value="stock" className="h-10 px-4">
                      Shares
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              </div>
              {form.instrument !== "stock" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={Boolean(errors.strike)}>
                    <FieldLabel htmlFor="a-strike">Strike</FieldLabel>
                    <Input
                      id="a-strike"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      className="h-10"
                      value={form.strike}
                      onChange={(e) => set("strike", e.target.value)}
                    />
                    <FieldError errors={err("strike")} />
                  </Field>
                  <Field data-invalid={Boolean(errors.expiry)}>
                    <FieldLabel htmlFor="a-expiry">Expiry</FieldLabel>
                    <Input
                      id="a-expiry"
                      type="date"
                      className="h-10"
                      value={form.expiry}
                      onChange={(e) => set("expiry", e.target.value)}
                    />
                    <FieldError errors={err("expiry")} />
                  </Field>
                </div>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buy and sell points</CardTitle>
            <CardDescription>
              {form.instrument === "stock" ? "Share prices." : "Option premium per contract, as quoted."} Leave the buy
              point empty for &quot;at market&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="a-buylow">Buy point from</FieldLabel>
                  <Input
                    id="a-buylow"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="h-10"
                    value={form.buyLow}
                    onChange={(e) => set("buyLow", e.target.value)}
                  />
                </Field>
                <Field data-invalid={Boolean(errors.buyHigh)}>
                  <FieldLabel htmlFor="a-buyhigh">to (optional)</FieldLabel>
                  <Input
                    id="a-buyhigh"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="h-10"
                    value={form.buyHigh}
                    onChange={(e) => set("buyHigh", e.target.value)}
                  />
                  <FieldError errors={err("buyHigh")} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <Field key={i}>
                    <FieldLabel htmlFor={`a-t${i}`}>T{i + 1}</FieldLabel>
                    <Input
                      id={`a-t${i}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      className="h-10"
                      value={form.sellPoints[i]}
                      onChange={(e) => {
                        const next = [...form.sellPoints] as ComposerInitial["sellPoints"]
                        next[i] = e.target.value
                        set("sellPoints", next)
                      }}
                    />
                  </Field>
                ))}
              </div>
              <Field className="sm:w-1/2">
                <FieldLabel htmlFor="a-stop">Stop</FieldLabel>
                <Input
                  id="a-stop"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className="h-10"
                  value={form.stop}
                  onChange={(e) => set("stop", e.target.value)}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Note</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.title)}>
                <FieldLabel htmlFor="a-title">Title</FieldLabel>
                <Input
                  id="a-title"
                  className="h-10"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder={defaultAlertTitle(fields)}
                />
                <FieldDescription>Leave empty to use the contract line.</FieldDescription>
                <FieldError errors={err("title")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="a-body">Why, and what to watch</FieldLabel>
                <Textarea
                  id="a-body"
                  rows={5}
                  value={form.body}
                  onChange={(e) => set("body", e.target.value)}
                  placeholder="Holding the channel line. Entry on a pullback into the buy point..."
                />
              </Field>
              <Field>
                <FieldLabel>Chart image</FieldLabel>
                {form.imagePath ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {form.imagePath.split("/").at(-1)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove image"
                      onClick={() => set("imagePath", null)}
                    >
                      <LuX />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => void upload(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Spinner /> : <LuImagePlus />}
                      Add a chart or photo
                    </Button>
                  </div>
                )}
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>The notification and the alert as members will see them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-sm font-semibold">{preview.title}</p>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{preview.body || "No details yet."}</p>
            </div>
            <AlertCard
              alert={{
                id: id ?? "preview",
                kind: form.kind,
                title,
                body: form.body,
                symbol: fields.symbol,
                assetType: fields.assetType,
                buyLow: fields.buyLow,
                buyHigh: fields.buyHigh,
                sellPoints: [...fields.sellPoints],
                stop: fields.stop,
                status: "published",
                resultPct: null,
                parentId: null,
                edited: false,
                publishedAt: null,
                instrumentTitle: form.title.trim() === "" && fields.symbol !== null,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
            <CardDescription>In the app and as a browser notification to members who turned them on.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">Also email</span>
                <span className="block text-sm text-muted-foreground">
                  {emailAvailable ? "To members who chose email for this kind." : "Email is not set up yet."}
                </span>
              </span>
              <Switch
                checked={form.sendEmail && emailAvailable}
                onCheckedChange={(v) => set("sendEmail", v)}
                disabled={!emailAvailable}
              />
            </label>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">Schedule</span>
                <span className="block text-sm text-muted-foreground">Publish later instead of now.</span>
              </span>
              <Switch checked={schedule} onCheckedChange={setSchedule} />
            </label>
            {schedule && (
              <Field>
                <FieldLabel htmlFor="a-when">Publish at (your time)</FieldLabel>
                <Input
                  id="a-when"
                  type="datetime-local"
                  className="h-10"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                />
              </Field>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky on phones so HG can post from anywhere. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t bg-background/95 p-3 backdrop-blur xl:static xl:col-span-2 xl:justify-end xl:border-0 xl:bg-transparent xl:p-0">
        <Button
          variant="outline"
          size="lg"
          className="flex-1 xl:flex-none"
          disabled={pending || uploading}
          onClick={() => save(false)}
        >
          <LuSave />
          Save draft
        </Button>
        <Button
          size="lg"
          className="flex-1 xl:flex-none"
          disabled={pending || uploading || (schedule && !publishAt)}
          onClick={() => save(true)}
        >
          {pending ? <Spinner /> : schedule ? <LuCalendarClock /> : <LuSend />}
          {schedule ? "Schedule" : "Publish now"}
        </Button>
      </div>
    </div>
  )
}
