"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuMessageSquarePlus } from "react-icons/lu"
import { askQuestion } from "@/lib/actions/chat"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

/** "Ask a question": starts a thread that experts and admins answer. */
export function AskQuestion() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState("")
  const [staffOnly, setStaffOnly] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      const result = await askQuestion({ body, staffOnly })
      if (!result.ok) {
        toast.add({ title: "Not sent", description: result.message, type: "error" })
        return
      }
      setOpen(false)
      setBody("")
      setStaffOnly(false)
      router.push(`/members/chat/${result.data.id}`)
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <LuMessageSquarePlus />
        Ask a question
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask a question</DialogTitle>
          <DialogDescription>An expert trader or HG&apos;s team will answer here.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field>
            <FieldLabel htmlFor="ask-body">Your question</FieldLabel>
            <Textarea
              id="ask-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="When TSM breaks 465, do we take the 457.50 put right away or wait for the close?"
              autoFocus
            />
            <FieldDescription>The first line becomes the title.</FieldDescription>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={staffOnly} onCheckedChange={(v) => setStaffOnly(v)} className="mt-0.5" />
            <span>
              <span className="block font-medium">Only experts and admins can see it</span>
              <span className="block text-muted-foreground">
                Otherwise the whole class can read the question and the answer.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || body.trim() === ""}>
              {pending && <Spinner />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
