"use client"

import { deleteObject, ref, uploadBytes } from "firebase/storage"
import { useRef, useState, useTransition } from "react"
import { LuImagePlus, LuTrash2 } from "react-icons/lu"
import { setTradeScreenshots } from "@/lib/actions/journal"
import { clientStorage } from "@/lib/firebase/client-storage"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

const MAX_BYTES = 10 * 1024 * 1024

/** Chart screenshots for a trade: uploaded to the member's own folder, shown through the server. */
export function Screenshots({
  uid,
  tradeId,
  paths,
  editable,
}: {
  uid: string
  tradeId: string
  paths: string[]
  editable: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState(paths)
  const [pending, startTransition] = useTransition()

  const upload = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast.add({ title: "Use a PNG, JPG, WebP or GIF image", type: "error" })
      return
    }
    if (file.size > MAX_BYTES) {
      toast.add({ title: "Images must be under 10 MB", type: "error" })
      return
    }
    startTransition(async () => {
      const name = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-").slice(-80)}`
      const path = `journal/${uid}/${tradeId}/${name}`
      try {
        await uploadBytes(ref(clientStorage(), path), file, { contentType: file.type })
        const next = [...current, path]
        const result = await setTradeScreenshots(tradeId, next)
        if (!result.ok) throw new Error(result.message)
        setCurrent(next)
      } catch (error) {
        toast.add({
          title: "Upload failed",
          description: error instanceof Error ? error.message : undefined,
          type: "error",
        })
      }
    })
  }

  const remove = (path: string) =>
    startTransition(async () => {
      const next = current.filter((p) => p !== path)
      const result = await setTradeScreenshots(tradeId, next)
      if (!result.ok) {
        toast.add({ title: "Could not remove", description: result.message, type: "error" })
        return
      }
      setCurrent(next)
      await deleteObject(ref(clientStorage(), path)).catch(() => undefined)
    })

  return (
    <div className="flex flex-col gap-3">
      {current.length === 0 && <p className="text-sm text-muted-foreground">No screenshots yet.</p>}
      <div className="grid grid-cols-2 gap-2">
        {current.map((path, i) => (
          <figure key={path} className="group relative overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element -- streamed by an authenticated route */}
            <img
              src={`/members/journal/${tradeId}/screenshots/${i}?v=${encodeURIComponent(path.slice(-24))}`}
              alt={`Screenshot ${i + 1}`}
              className="aspect-video w-full object-cover"
              loading="lazy"
            />
            {editable && (
              <Button
                size="icon-sm"
                variant="secondary"
                className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove screenshot ${i + 1}`}
                onClick={() => remove(path)}
                disabled={pending}
              >
                <LuTrash2 />
              </Button>
            )}
          </figure>
        ))}
      </div>
      {editable && current.length < 8 && (
        <div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
          />
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={pending}>
            {pending ? <Spinner /> : <LuImagePlus />}
            Add screenshot
          </Button>
        </div>
      )}
    </div>
  )
}
