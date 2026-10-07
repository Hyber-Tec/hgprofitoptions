"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { LuCheckCheck, LuSearch } from "react-icons/lu"
import { ALERT_KINDS, ALERT_KIND_LABEL } from "@/core/alerts"
import { markAllAlertsRead } from "@/lib/actions/member-alerts"
import { useUpdateSearchParams } from "@/hooks/use-update-search-params"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const STATUS_ITEMS = [
  { value: "all", label: "Open and closed" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
]

export function AlertFilters({ unreadCount }: { unreadCount: number }) {
  const params = useSearchParams()
  const [update, pending] = useUpdateSearchParams()
  const [marking, startMarking] = useTransition()
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "")
  const kind = params.get("kind") ?? "all"

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = symbol.trim().toUpperCase()
      if (next !== (params.get("symbol") ?? "")) update({ symbol: next || null })
    }, 300)
    return () => clearTimeout(handle)
  }, [symbol, params, update])

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[kind]}
          onValueChange={(v: string[]) => update({ kind: v[0] && v[0] !== "all" ? v[0] : null })}
          aria-label="Alert kind"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {ALERT_KINDS.map((k) => (
            <ToggleGroupItem key={k} value={k}>
              {ALERT_KIND_LABEL[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select
          items={STATUS_ITEMS}
          value={params.get("status") ?? "all"}
          onValueChange={(v: string | null) => update({ status: v && v !== "all" ? v : null })}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup className="h-8 w-36">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Ticker"
            aria-label="Filter by ticker"
            className="uppercase placeholder:normal-case"
          />
        </InputGroup>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={params.get("unread") === "1"}
            onCheckedChange={(on) => update({ unread: on ? "1" : null })}
          />
          Unread only
        </label>
        {pending && <Spinner className="text-muted-foreground" />}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={unreadCount === 0 || marking}
        onClick={() =>
          startMarking(async () => {
            const result = await markAllAlertsRead()
            if (!result.ok)
              toast.add({ title: "Could not mark alerts as read", description: result.message, type: "error" })
          })
        }
      >
        {marking ? <Spinner /> : <LuCheckCheck />}
        Mark all as read
      </Button>
    </div>
  )
}
