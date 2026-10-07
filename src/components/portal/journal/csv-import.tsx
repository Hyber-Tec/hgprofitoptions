"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { LuCircleAlert, LuDownload, LuFileUp, LuUpload } from "react-icons/lu"
import { formatSignedMoney } from "@/core/format"
import { TEMPLATE_CSV } from "@/core/parsers/trades-csv"
import { importTradesCsv, type ImportPreview } from "@/lib/actions/journal"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { Stat } from "../display"

export function CsvImport() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const choose = (file: File | undefined) => {
    if (!file) return
    setName(file.name)
    setPreview(null)
    setError(null)
    startTransition(async () => {
      const text = await file.text()
      setCsv(text)
      const result = await importTradesCsv({ csv: text, commit: false })
      if (result.ok) setPreview(result.data)
      else setError(result.message)
    })
  }

  const commit = () =>
    startTransition(async () => {
      if (!csv) return
      const result = await importTradesCsv({ csv, commit: true })
      if (!result.ok) return setError(result.message)
      toast.add({
        title: "Trades imported",
        description: `${result.data.closed} closed and ${result.data.open} open trades were added.`,
        type: "success",
      })
      router.push("/members/journal")
    })

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Choose a file</CardTitle>
            <CardDescription>
              Webull order history (Orders, export CSV) or the simple template. Only filled orders are imported.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                choose(e.dataTransfer.files[0])
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {pending ? <Spinner className="size-6" /> : <LuFileUp className="size-6 text-muted-foreground" />}
              <span className="font-medium">{name || "Drop a CSV here or click to choose"}</span>
              <span className="text-sm text-muted-foreground">Up to 2 MB</span>
            </button>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </CardContent>
        </Card>
        {error && (
          <Alert variant="destructive">
            <LuCircleAlert />
            <AlertTitle>This file could not be imported</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {preview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {preview.format === "webull" ? "Webull order history" : "Template format"} · {preview.fills} filled
                orders
                {preview.skipped > 0 && ` · ${preview.skipped} unfilled skipped`}
                {preview.duplicates > 0 && ` · ${preview.duplicates} already imported`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Closed trades" value={preview.closed} />
                <Stat label="Open trades" value={preview.open} />
                <Stat
                  label="Realized P&L"
                  value={<span className="text-lg">{formatSignedMoney(preview.realizedPnl)}</span>}
                />
              </div>
              {preview.sample.length > 0 && (
                <ul className="flex flex-col divide-y rounded-lg border text-sm">
                  {preview.sample.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate font-mono text-[13px]">{s.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.status === "open" ? "Open" : formatSignedMoney(s.realizedPnl)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {preview.issues.length > 0 && (
                <Alert>
                  <LuCircleAlert />
                  <AlertTitle>{preview.issues.length} rows were skipped</AlertTitle>
                  <AlertDescription>
                    <ul className="flex flex-col gap-0.5">
                      {preview.issues.slice(0, 8).map((i) => (
                        <li key={`${i.line}-${i.message}`}>
                          Line {i.line}: {i.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="border-t pt-4">
              <Button onClick={commit} disabled={pending || preview.closed + preview.open === 0}>
                {pending ? <Spinner /> : <LuUpload />}
                Import {preview.closed + preview.open} trades
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
      <Card size="sm" className="h-fit">
        <CardHeader>
          <CardTitle>Using another broker?</CardTitle>
          <CardDescription>Fill in the template: one row per execution, times in New York time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed">{TEMPLATE_CSV}</pre>
          <Button
            variant="outline"
            size="sm"
            render={<a href={templateHref} download="hg-journal-template.csv" />}
            nativeButton={false}
          >
            <LuDownload />
            Download template
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
