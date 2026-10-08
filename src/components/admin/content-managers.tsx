"use client"

import { useState, useTransition, type ReactNode } from "react"
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu"
import type { IsoDate } from "@/core/domain/types"
import { formatDate } from "@/core/format"
import { deletePresentation, deleteResource, savePresentation, saveResource } from "@/lib/actions/admin/content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "@/components/portal/display"
import { UploadField, type UploadedFile } from "./upload-field"
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

function EditorDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  onSave: () => void
  pending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FieldGroup>{children}</FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending && <Spinner />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Presentations ----------------------------------------------------------------------------

export interface PresentationRow {
  id: string
  title: string
  sessionDate: string
  summary: string | null
  slidesPath: string | null
  videoUrl: string | null
  published: boolean
}

const EMPTY_PRESENTATION = { title: "", sessionDate: "", summary: "", videoUrl: "", published: true }

export function PresentationsManager({ items }: { items: PresentationRow[] }) {
  const dialog = useEditorDialog<PresentationRow>()
  const [form, setForm] = useState(EMPTY_PRESENTATION)
  const [slides, setSlides] = useState<UploadedFile | null>(null)
  const [pending, startTransition] = useTransition()

  const open = (item: PresentationRow | null) => {
    dialog.show(item)
    if (item === null) {
      setForm(EMPTY_PRESENTATION)
      setSlides(null)
    } else {
      setForm({
        title: item.title,
        sessionDate: item.sessionDate,
        summary: item.summary ?? "",
        videoUrl: item.videoUrl ?? "",
        published: item.published,
      })
      setSlides(
        item.slidesPath
          ? {
              path: item.slidesPath,
              name: item.slidesPath.split("/").at(-1) ?? "slides.pdf",
              size: 0,
              type: "application/pdf",
            }
          : null,
      )
    }
  }
  const save = () =>
    startTransition(async () => {
      const result = await savePresentation(dialog.target?.id ?? null, { ...form, slidesPath: slides?.path ?? null })
      if (done(result.ok ? { ok: true } : result, "Presentation saved")) dialog.close()
    })
  const togglePublished = (item: PresentationRow, published: boolean) =>
    startTransition(async () => {
      done(
        await savePresentation(item.id, {
          title: item.title,
          sessionDate: item.sessionDate,
          summary: item.summary ?? "",
          slidesPath: item.slidesPath,
          videoUrl: item.videoUrl ?? "",
          published,
        }).then((r) => (r.ok ? { ok: true as const } : r)),
        published ? "Published" : "Hidden from members",
      )
    })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" onClick={() => open(null)}>
          <LuPlus />
          Add presentation
        </Button>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">No presentations yet.</li>}
        {items.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{p.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(p.sessionDate as IsoDate)} · {p.slidesPath ? "Slides" : "No slides"}
                {p.videoUrl ? " · Recording" : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={p.published} onCheckedChange={(v) => togglePublished(p, v)} disabled={pending} />
                Published
              </label>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.title}`} onClick={() => open(p)}>
                <LuPencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${p.title}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => void done(await deletePresentation(p.id), "Presentation deleted"))
                }
              >
                <LuTrash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <EditorDialog
        open={dialog.open}
        onOpenChange={dialog.onOpenChange}
        title={dialog.target ? "Edit presentation" : "Add presentation"}
        description="Slides are stamped with each member's name when they download them."
        onSave={save}
        pending={pending}
      >
        <Field>
          <FieldLabel htmlFor="p-title">Title</FieldLabel>
          <Input id="p-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="p-date">Class date</FieldLabel>
          <Input
            id="p-date"
            type="date"
            value={form.sessionDate}
            onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="p-summary">Summary</FieldLabel>
          <Textarea
            id="p-summary"
            rows={2}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>Slides (PDF)</FieldLabel>
          <UploadField
            folder="presentations"
            accept="application/pdf"
            value={slides}
            onChange={setSlides}
            label="Upload slides"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="p-video">Recording link</FieldLabel>
          <Input
            id="p-video"
            value={form.videoUrl}
            onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
            placeholder="https://"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
          Visible to members
        </label>
      </EditorDialog>
    </div>
  )
}

// ---- Files ------------------------------------------------------------------------------------

export interface ResourceRow {
  id: string
  folder: string
  title: string
  description: string | null
  storagePath: string
  mimeType: string | null
  sizeBytes: number | null
  published: boolean
}

export function FilesManager({ items }: { items: ResourceRow[] }) {
  const dialog = useEditorDialog<ResourceRow>()
  const [form, setForm] = useState({ folder: "", title: "", description: "", published: true })
  const [file, setFile] = useState<UploadedFile | null>(null)
  const [pending, startTransition] = useTransition()
  const folders = [...new Set(items.map((i) => i.folder))].sort()

  const open = (item: ResourceRow | null) => {
    dialog.show(item)
    if (item === null) {
      setForm({ folder: folders[0] ?? "", title: "", description: "", published: true })
      setFile(null)
    } else {
      setForm({
        folder: item.folder,
        title: item.title,
        description: item.description ?? "",
        published: item.published,
      })
      setFile({
        path: item.storagePath,
        name: item.storagePath.split("/").at(-1) ?? "file",
        size: item.sizeBytes ?? 0,
        type: item.mimeType ?? "",
      })
    }
  }
  const save = () =>
    startTransition(async () => {
      if (!file) {
        toast.add({ title: "Upload a file first", type: "error" })
        return
      }
      const result = await saveResource(dialog.target?.id ?? null, {
        ...form,
        storagePath: file.path,
        mimeType: file.type || null,
        sizeBytes: file.size || null,
      })
      if (done(result.ok ? { ok: true } : result, "File saved")) dialog.close()
    })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" onClick={() => open(null)}>
          <LuPlus />
          Upload file
        </Button>
      </div>
      {folders.length === 0 && <p className="text-sm text-muted-foreground">No files yet.</p>}
      {folders.map((folder) => (
        <section key={folder} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{folder}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {items
              .filter((i) => i.folder === folder)
              .map((r) => (
                <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {r.title}
                      {!r.published && <ToneBadge tone="muted">Hidden</ToneBadge>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.description ?? r.storagePath.split("/").at(-1)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.title}`} onClick={() => open(r)}>
                      <LuPencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${r.title}`}
                      disabled={pending}
                      onClick={() => startTransition(async () => void done(await deleteResource(r.id), "File deleted"))}
                    >
                      <LuTrash2 />
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <EditorDialog
        open={dialog.open}
        onOpenChange={dialog.onOpenChange}
        title={dialog.target ? "Edit file" : "Upload file"}
        description="PDFs are stamped with each member's name when opened."
        onSave={save}
        pending={pending}
      >
        <Field>
          <FieldLabel htmlFor="r-folder">Folder</FieldLabel>
          <Input
            id="r-folder"
            list="file-folders"
            value={form.folder}
            onChange={(e) => setForm({ ...form, folder: e.target.value })}
            placeholder="Getting started"
          />
          <datalist id="file-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="r-title">Title</FieldLabel>
          <Input id="r-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="r-desc">Description</FieldLabel>
          <Input
            id="r-desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>File</FieldLabel>
          <UploadField folder="files" value={file} onChange={setFile} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
          Visible to members
        </label>
      </EditorDialog>
    </div>
  )
}
