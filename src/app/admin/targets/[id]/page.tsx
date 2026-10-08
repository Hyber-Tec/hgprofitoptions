import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LuArrowUpRight, LuPencil } from "react-icons/lu"
import { formatDateTimeET, formatDateWithWeekday } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import {
  editorContext,
  groupsFor,
  listRevisions,
  previousUpdate,
  readUpdateDoc,
  rowsFor,
} from "@/lib/admin/targets-data"
import { TargetsEditor } from "@/components/admin/targets-editor"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Strike target update" }

export default async function AdminTargetUpdatePage({ params, searchParams }: PageProps<"/admin/targets/[id]">) {
  const { id } = await params
  await requireAdmin({ next: `/admin/targets/${id}` })
  const doc = await readUpdateDoc(id)
  if (!doc) notFound()
  const editing = (await searchParams).edit === "1"
  const { configGroups, tickers } = await editorContext()

  if (doc.status === "draft") {
    const previous = await previousUpdate(doc.effectiveDate, false)
    return (
      <>
        <PageHeader
          title="Draft update"
          description={`For ${formatDateWithWeekday(doc.effectiveDate)}. Members cannot see drafts.`}
        />
        <TargetsEditor
          initial={{
            mode: "draft",
            draftId: doc.id,
            effectiveDate: doc.effectiveDate,
            text: doc.sourceText ?? "",
            rows: rowsFor(doc.entries),
            groups: groupsFor(doc.entries, configGroups, doc.groups),
          }}
          configGroups={configGroups}
          tickers={tickers}
          previous={previous}
        />
      </>
    )
  }

  if (editing) {
    const previous = await previousUpdate(doc.effectiveDate, true)
    return (
      <>
        <PageHeader
          title={`Correct the ${formatDateWithWeekday(doc.effectiveDate)} update`}
          description="Members see that it was corrected and your note. The current version is kept in the history."
        />
        <TargetsEditor
          initial={{
            mode: "revise",
            draftId: null,
            effectiveDate: doc.effectiveDate,
            text: doc.sourceText ?? "",
            rows: rowsFor(doc.entries),
            groups: groupsFor(doc.entries, configGroups),
          }}
          configGroups={configGroups}
          tickers={tickers}
          previous={previous}
        />
      </>
    )
  }

  const revisions = await listRevisions(doc.effectiveDate)
  const counts = groupsFor(doc.entries, configGroups).map((g) => ({
    ...g,
    count: doc.entries.filter((e) => e.group === g.slug).length,
  }))
  return (
    <>
      <PageHeader
        title={formatDateWithWeekday(doc.effectiveDate)}
        description={doc.title}
        meta={
          <>
            <ToneBadge tone="positive">Published</ToneBadge>
            {doc.publishedAt && <span>{formatDateTimeET(doc.publishedAt)}</span>}
            {doc.revision > 1 && (
              <span>
                Corrected (v{doc.revision}){doc.changeNote ? `: ${doc.changeNote}` : ""}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/members/targets/${doc.effectiveDate}`} />}
              nativeButton={false}
            >
              Member view
              <LuArrowUpRight />
            </Button>
            <Button
              size="sm"
              render={<Link href={`/admin/targets/${doc.effectiveDate}?edit=1`} />}
              nativeButton={false}
            >
              <LuPencil />
              Correct this update
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>{doc.entries.length} tickers</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {counts.map((g) => (
              <span key={g.slug} className="rounded-lg border px-3 py-1.5 text-sm">
                {g.name} <span className="text-muted-foreground tabular-nums">{g.count}</span>
              </span>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              {revisions.length === 0 ? "Never corrected." : `${revisions.length} earlier versions`}
            </CardDescription>
          </CardHeader>
          {revisions.length > 0 && (
            <CardContent className="flex flex-col gap-2 text-sm">
              {revisions.map((r) => (
                <p key={r.revision}>
                  Version {r.revision} · {r.entries} tickers
                  <span className="block text-xs text-muted-foreground">
                    {r.replacedAt ? `Replaced ${formatDateTimeET(r.replacedAt)}` : ""}
                    {r.changeNote ? ` · ${r.changeNote}` : ""}
                  </span>
                </p>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    </>
  )
}
