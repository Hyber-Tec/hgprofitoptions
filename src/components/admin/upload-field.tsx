"use client"

import { ref, uploadBytesResumable } from "firebase/storage"
import { useRef, useState } from "react"
import { LuFileUp, LuX } from "react-icons/lu"
import { clientStorage } from "@/lib/firebase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/toast"

export interface UploadedFile {
  path: string
  name: string
  size: number
  type: string
}

const MAX_BYTES = 100 * 1024 * 1024

/** Uploads straight to Cloud Storage under content/ (storage rules allow admins only). */
export function UploadField({
  folder,
  accept,
  value,
  onChange,
  label = "Choose a file",
}: {
  folder: string
  accept?: string
  value: UploadedFile | null
  onChange: (file: UploadedFile | null) => void
  label?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const upload = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.add({ title: "Files must be under 100 MB", type: "error" })
      return
    }
    const path = `content/${folder}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-").slice(-100)}`
    const task = uploadBytesResumable(ref(clientStorage(), path), file, {
      contentType: file.type || "application/octet-stream",
    })
    setProgress(0)
    task.on(
      "state_changed",
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      () => {
        setProgress(null)
        toast.add({
          title: "Upload failed",
          description: "Check your connection and that you are signed in as an admin.",
          type: "error",
        })
      },
      () => {
        setProgress(null)
        onChange({ path, name: file.name, size: file.size, type: file.type || "application/octet-stream" })
      },
    )
  }

  if (progress !== null) return <Progress value={progress} aria-label="Uploading" />
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <LuFileUp className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => onChange(null)}>
          <LuX />
        </Button>
      </div>
    )
  }
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <Button type="button" variant="outline" onClick={() => input.current?.click()}>
        <LuFileUp />
        {label}
      </Button>
    </div>
  )
}
