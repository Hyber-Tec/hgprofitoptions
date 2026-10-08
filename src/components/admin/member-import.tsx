"use client"

import { useRef, useState, useTransition } from "react"
import { LuCopy, LuFileUp, LuUpload } from "react-icons/lu"
import { MEMBER_CSV_COLUMNS, MEMBER_CSV_TEMPLATE } from "@/core/parsers/members-csv"
import { importMembersCsv, type MemberImportRow } from "@/lib/actions/admin/members"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "@/components/portal/display"

export function MemberImport() {
  const input = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<string | null>(null)
  const [rows, setRows] = useState<MemberImportRow[] | null>(null)
  const [links, setLinks] = useState<{ email: string; link: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = (text: string) =>
    startTransition(async () => {
      setCsv(text)
      setLinks([])
      const result = await importMembersCsv({ csv: text, commit: false })
      if (result.ok) {
        setRows(result.data.rows)
        setError(null)
      } else {
        setRows(null)
        setError(result.message)
      }
    })
  const commit = () =>
    startTransition(async () => {
      if (!csv) return
      const result = await importMembersCsv({ csv, commit: true })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setRows(result.data.rows)
      setLinks(result.data.links)
      const created = result.data.created
      toast.add({
        title: `${created} ${created === 1 ? "member" : "members"} invited`,
        description: created === 1 ? "Send them the link below." : "Send each one their link below.",
        type: "success",
      })
    })

  const ready = rows?.filter((r) => r.status === "ready").length ?? 0
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose a CSV</CardTitle>
          <CardDescription>
            One row per member, with these columns: {MEMBER_CSV_COLUMNS.join(", ")}. Only name, email, start_quarter (1
            to 4) and start_year are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed">
            {MEMBER_CSV_TEMPLATE}
          </pre>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => void e.target.files?.[0]?.text().then(preview)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => input.current?.click()} disabled={pending}>
              {pending ? <Spinner /> : <LuFileUp />}
              Choose CSV
            </Button>
            <Button
              variant="ghost"
              render={
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(MEMBER_CSV_TEMPLATE)}`}
                  download="hg-members-template.csv"
                />
              }
              nativeButton={false}
            >
              Download template
            </Button>
          </div>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {rows && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              {ready} ready · {rows.filter((r) => r.status === "exists").length} skipped ·{" "}
              {rows.filter((r) => r.status === "error").length} to fix
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-0">Line</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Membership</TableHead>
                  <TableHead className="px-0">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.line} className="hover:bg-transparent">
                    <TableCell className="px-0 text-muted-foreground tabular-nums">{r.line}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{r.fullName || "-"}</span>
                      <span className="block text-xs text-muted-foreground">{r.email}</span>
                    </TableCell>
                    <TableCell className="text-sm">{r.period ?? "-"}</TableCell>
                    <TableCell className="px-0">
                      <ToneBadge
                        tone={r.status === "ready" ? "positive" : r.status === "exists" ? "muted" : "negative"}
                      >
                        {r.status === "ready" ? "Ready" : r.status === "exists" ? "Skipped" : "Fix"}
                      </ToneBadge>
                      {r.message && <span className="block text-xs text-muted-foreground">{r.message}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {links.length === 0 && (
            <CardFooter className="border-t pt-4">
              <Button onClick={commit} disabled={pending || ready === 0}>
                {pending ? <Spinner /> : <LuUpload />}
                Invite {ready} {ready === 1 ? "member" : "members"}
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitation links</CardTitle>
            <CardDescription>
              Each link works once and expires in 14 days. Members can also sign in with Google using their invited
              email.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => {
                void navigator.clipboard.writeText(links.map((l) => `${l.email}\t${l.link}`).join("\n"))
                toast.add({ title: "Copied all links", type: "success" })
              }}
            >
              <LuCopy />
              Copy all
            </Button>
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {links.map((l) => (
                <li key={l.email} className="truncate">
                  {l.email} · {l.link}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
