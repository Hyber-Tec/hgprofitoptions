"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type SubmitEvent } from "react"
import { LuCircleCheck, LuTrash2 } from "react-icons/lu"
import { closeManualTrade, deleteManualTrade } from "@/lib/actions/journal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

/** "2026-10-07T14:05" in the browser's time zone, for datetime-local inputs. */
function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function CloseTradeButton({
  tradeId,
  openQuantity,
  isOption,
}: {
  tradeId: string
  openQuantity: number
  isOption: boolean
}) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState(String(openQuantity))
  const [fees, setFees] = useState("0")
  const [when, setWhen] = useState(localNow)
  const [pending, startTransition] = useTransition()
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await closeManualTrade(tradeId, {
        price: Number(price),
        quantity: Number(quantity),
        fees: Number(fees || 0),
        closedAt: new Date(when).toISOString(),
      })
      if (!result.ok) {
        toast.add({ title: "Not saved", description: result.message, type: "error" })
        return
      }
      setOpen(false)
      toast.add({ title: "Trade updated", type: "success" })
    })
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <LuCircleCheck />
        Close trade
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Close this trade</DialogTitle>
            <DialogDescription>Record the exit. Close part of it to scale out.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="close-price">{isOption ? "Exit premium" : "Exit price"}</FieldLabel>
                <Input
                  id="close-price"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="close-qty">{isOption ? "Contracts" : "Shares"}</FieldLabel>
                <Input
                  id="close-qty"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  max={openQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="close-fees">Fees</FieldLabel>
                <Input
                  id="close-fees"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="close-when">When</FieldLabel>
                <Input
                  id="close-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  required
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteTradeButton({ tradeId }: { tradeId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        <LuTrash2 />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
          <AlertDialogDescription>
            The trade, its journal and its private note are removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteManualTrade(tradeId)
                if (!result.ok) {
                  toast.add({ title: "Not deleted", description: result.message, type: "error" })
                  return
                }
                toast.add({ title: "Trade deleted", type: "success" })
                router.replace("/members/journal")
              })
            }
          >
            {pending && <Spinner />}
            Delete trade
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
