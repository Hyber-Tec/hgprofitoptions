"use client"

import { useMemo, useState } from "react"
import { LuDownload, LuEye, LuFileText, LuFolder, LuSearch } from "react-icons/lu"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ButtonAnchor } from "@/components/shared/button-link"

export interface LibraryFile {
  id: string
  folder: string
  title: string
  description: string | null
  sizeBytes: number | null
  isPdf: boolean
}

const size = (bytes: number | null) =>
  bytes === null
    ? ""
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function FilesLibrary({ files }: { files: LibraryFile[] }) {
  const [query, setQuery] = useState("")
  const [folder, setFolder] = useState<string | null>(null)
  const folders = useMemo(() => [...new Set(files.map((f) => f.folder))].sort(), [files])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter(
      (f) =>
        (!folder || f.folder === folder) &&
        (!q || `${f.title} ${f.description ?? ""} ${f.folder}`.toLowerCase().includes(q)),
    )
  }, [files, folder, query])

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Folders" className="flex gap-1 overflow-x-auto lg:flex-col">
        {[null, ...folders].map((f) => (
          <button
            key={f ?? "all"}
            type="button"
            onClick={() => setFolder(f)}
            aria-pressed={folder === f}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              folder === f && "bg-muted font-medium",
            )}
          >
            <LuFolder className="size-4 text-muted-foreground" />
            <span className="flex-1">{f ?? "All files"}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {f ? files.filter((x) => x.folder === f).length : files.length}
            </span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-4">
        <InputGroup className="h-9">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            aria-label="Search files"
          />
        </InputGroup>
        {filtered.length === 0 ? (
          <Empty className="border border-dashed py-12">
            <EmptyHeader>
              <EmptyTitle>No files found</EmptyTitle>
              <EmptyDescription>Try another word or folder.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {filtered.map((f) => (
              <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                  <LuFileText className="size-5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[f.description, f.folder, size(f.sizeBytes)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {f.isPdf && (
                    <ButtonAnchor
                      size="sm"
                      variant="outline"
                      href={`/members/files/${f.id}/download`}
                      target="_blank"
                      rel="noopener"
                    >
                      <LuEye />
                      Open
                    </ButtonAnchor>
                  )}
                  <ButtonAnchor size="sm" variant="outline" href={`/members/files/${f.id}/download?download=1`}>
                    <LuDownload />
                    Download
                  </ButtonAnchor>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
