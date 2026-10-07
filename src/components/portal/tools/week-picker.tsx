"use client"

import { useUpdateSearchParams } from "@/hooks/use-update-search-params"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

export function WeekPicker({ options, current }: { options: { value: string; label: string }[]; current: string }) {
  const [update, pending] = useUpdateSearchParams()
  return (
    <div className="flex items-center gap-2">
      <Select items={options} value={current} onValueChange={(v: string | null) => update({ week: v })}>
        <SelectTrigger size="sm" className="w-56" aria-label="Week">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Spinner className="text-muted-foreground" />}
    </div>
  )
}
