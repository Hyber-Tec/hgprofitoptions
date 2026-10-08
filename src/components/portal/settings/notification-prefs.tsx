"use client"

import { useState, useTransition } from "react"
import { LuPlus, LuSave, LuX } from "react-icons/lu"
import { ALERT_KINDS, ALERT_KIND_LABEL } from "@/core/alerts"
import type { AlertKind } from "@/core/domain/types"
import { updateNotificationPrefs } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"

export interface PrefsValues {
  pushKinds: AlertKind[]
  emailKinds: AlertKind[]
  mutedSymbols: string[]
  targetsPublished: boolean
  membershipReminders: boolean
}

export function NotificationPrefs({ initial, emailAvailable }: { initial: PrefsValues; emailAvailable: boolean }) {
  const [prefs, setPrefs] = useState(initial)
  const [symbol, setSymbol] = useState("")
  const [pending, startTransition] = useTransition()
  const toggle = (key: "pushKinds" | "emailKinds", kind: AlertKind, on: boolean) =>
    setPrefs((p) => ({ ...p, [key]: on ? [...new Set([...p[key], kind])] : p[key].filter((k) => k !== kind) }))
  const addSymbol = () => {
    const s = symbol.trim().toUpperCase()
    if (!/^[A-Z][A-Z.]{0,5}$/.test(s)) {
      toast.add({ title: "Enter a ticker like TSLA", type: "error" })
      return
    }
    setPrefs((p) => ({ ...p, mutedSymbols: [...new Set([...p.mutedSymbols, s])].sort() }))
    setSymbol("")
  }
  const save = () =>
    startTransition(async () => {
      const result = await updateNotificationPrefs(prefs)
      toast.add(
        result.ok
          ? { title: "Notification settings saved", type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
    })

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Alerts by kind</h3>
          <p className="text-sm text-muted-foreground">
            Every alert always appears in the feed. Choose which ones also notify you.
          </p>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kind</TableHead>
                <TableHead className="text-center">Browser</TableHead>
                <TableHead className="text-center">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALERT_KINDS.map((kind) => (
                <TableRow key={kind} className="hover:bg-transparent">
                  <TableCell className="font-medium">{ALERT_KIND_LABEL[kind]}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={`${ALERT_KIND_LABEL[kind]} browser notifications`}
                      checked={prefs.pushKinds.includes(kind)}
                      onCheckedChange={(v) => toggle("pushKinds", kind, v)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={`${ALERT_KIND_LABEL[kind]} emails`}
                      checked={prefs.emailKinds.includes(kind)}
                      disabled={!emailAvailable}
                      onCheckedChange={(v) => toggle("emailKinds", kind, v)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!emailAvailable && <p className="text-xs text-muted-foreground">Email alerts are not switched on yet.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Muted tickers</h3>
          <p className="text-sm text-muted-foreground">
            No notifications for these tickers. Their alerts still show in the feed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {prefs.mutedSymbols.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
          {prefs.mutedSymbols.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 font-mono text-sm"
            >
              {s}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Unmute ${s}`}
                onClick={() => setPrefs((p) => ({ ...p, mutedSymbols: p.mutedSymbols.filter((x) => x !== s) }))}
              >
                <LuX />
              </Button>
            </span>
          ))}
        </div>
        <div className="flex max-w-xs gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addSymbol()
              }
            }}
            placeholder="Ticker"
            aria-label="Ticker to mute"
          />
          <Button variant="outline" onClick={addSymbol}>
            <LuPlus />
            Mute
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">New strike targets published</span>
            <span className="block text-sm text-muted-foreground">
              A notification when HG publishes the weekly update.
            </span>
          </span>
          <Switch
            checked={prefs.targetsPublished}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, targetsPublished: v }))}
          />
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Membership reminders</span>
            <span className="block text-sm text-muted-foreground">14 and 3 days before your membership ends.</span>
          </span>
          <Switch
            checked={prefs.membershipReminders}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, membershipReminders: v }))}
          />
        </label>
      </section>

      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? <Spinner /> : <LuSave />}
          Save notification settings
        </Button>
      </div>
    </div>
  )
}
