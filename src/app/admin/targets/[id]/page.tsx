import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LuArrowUpRight, LuPencil } from "react-icons/lu"
import { formatDateTimeET, formatDateWithWeekday } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listTargetUpdates } from "@/lib/data/tools"
import { buildTargetRows } from "@/lib/tools/targets"
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
import { TargetsTable } from "@/components/portal/tools/targets-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ButtonLink } from "@/components/shared/button-link"

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
          title={`Edit the ${formatDateWithWeekday(doc.effectiveDate)} update`}
          description="Publishing saves a corrected version. Members see that it was corrected, what changed and your note; the current version stays in the history."
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

  const [revisions, published] = await Promise.all([listRevisions(doc.effectiveDate), listTargetUpdates()])
  const prior = published.find((u) => u.effectiveDate < doc.effectiveDate) ?? null
  const { rows, removed, groups } = await buildTargetRows(doc, prior)
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
            <ButtonLink size="sm" variant="outline" href={`/members/targets/${doc.effectiveDate}`}>
              Member view
              <LuArrowUpRight />
            </ButtonLink>
            <ButtonLink size="sm" href={`/admin/targets/${doc.effectiveDate}?edit=1`}>
              <LuPencil />
              Edit targets
            </ButtonLink>
          </>
        }
      />
      <TargetsTable rows={rows} removed={removed} groups={groups} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            {revisions.length === 0
              ? "Never corrected. Edit targets publishes a corrected version, and members see what changed."
              : `${revisions.length} earlier ${revisions.length === 1 ? "version" : "versions"}`}
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
    </>
  )
}
