"use client"

import { useState } from "react"
import { LuCheck, LuCopy } from "react-icons/lu"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/** Shows a one-time link (invite or password reset) with a copy button. */
export function LinkDialog({
  link,
  title,
  description,
  onOpenChange,
}: {
  link: string | null
  title: string
  description: string
  onOpenChange: (open: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={link ?? ""}
            onFocus={(e) => e.target.select()}
            aria-label="Link"
            className="font-mono text-xs"
          />
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <LuCheck /> : <LuCopy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
