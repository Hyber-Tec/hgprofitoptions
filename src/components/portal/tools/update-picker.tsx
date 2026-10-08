"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LuPrinter } from "react-icons/lu"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

/** Switches between published strike target updates. The newest one lives at /members/targets. */
export function UpdatePicker({
  options,
  current,
  latest,
}: {
  options: { value: string; label: string }[]
  current: string
  latest: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      <Select
        items={options}
        value={current}
        onValueChange={(v: string | null) => {
          if (!v) return
          startTransition(() => router.push(v === latest ? "/members/targets" : `/members/targets/${v}`))
        }}
      >
        <SelectTrigger size="sm" className="w-52" aria-label="Choose an update">
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

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <LuPrinter />
      Print
    </Button>
  )
}
