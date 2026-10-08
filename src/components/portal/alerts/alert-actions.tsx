"use client"

import { useEffect, useState, useTransition, type SubmitEvent } from "react"
import { LuBellOff, LuBellRing, LuCircleCheck, LuNotebookPen } from "react-icons/lu"
import { markAlertRead, setTickerMuted, tookAlertTrade } from "@/lib/actions/member-alerts"
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ButtonLink } from "@/components/shared/button-link"

/** Marks the alert as read once it has been shown. */
export function MarkRead({ alertId }: { alertId: string }) {
  useEffect(() => {
    void markAlertRead(alertId)
  }, [alertId])
  return null
}

export function TookTradeButton({
  alertId,
  defaultPrice,
  isOption,
  linked,
  alreadyTook,
}: {
  alertId: string
  defaultPrice: number | null
  isOption: boolean
  linked: boolean
  alreadyTook: boolean
}) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(isOption ? "1" : "10")
  const [price, setPrice] = useState(defaultPrice !== null ? defaultPrice.toFixed(2) : "")
  const [pending, startTransition] = useTransition()
  const [tradeId, setTradeId] = useState<string | null>(null)

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await tookAlertTrade({ alertId, quantity: Number(quantity), price: Number(price) })
      if (!result.ok) {
        toast.add({ title: "Could not save the trade", description: result.message, type: "error" })
        return
      }
      setTradeId(result.data.tradeId)
      setOpen(false)
      toast.add({
        title: "Trade saved",
        description: result.data.tradeId
          ? "It is now an open trade in your journal."
          : "Your brokerage trade will be linked to this alert when it syncs.",
        type: "success",
      })
    })
  }

  if (alreadyTook || tradeId !== null) {
    return (
      <ButtonLink variant="outline" href={tradeId ? `/members/journal/${tradeId}` : "/members/journal"}>
        <LuCircleCheck />
        You took this trade
      </ButtonLink>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <LuNotebookPen />I took this trade
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Log this trade</DialogTitle>
            <DialogDescription>
              {linked
                ? "Your linked brokerage will sync the fills. This links the trade to HG's alert."
                : "This adds an open trade to your journal, linked to HG's alert."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="took-qty">{isOption ? "Contracts" : "Shares"}</FieldLabel>
              <Input
                id="took-qty"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="took-price">{isOption ? "Premium paid per contract" : "Price per share"}</FieldLabel>
              <Input
                id="took-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
              {isOption && (
                <FieldDescription>
                  The option price as quoted, for example 3.25 (not multiplied by 100).
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Save trade
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function MuteTickerButton({ symbol, muted }: { symbol: string; muted: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setTickerMuted(symbol, !muted)
          if (result.ok)
            toast.add({
              title: muted ? `${symbol} notifications are on` : `${symbol} is muted`,
              description: muted ? undefined : "Alerts still appear in the feed, without notifications.",
              type: "success",
            })
          else toast.add({ title: "Could not update", description: result.message, type: "error" })
        })
      }
    >
      {pending ? <Spinner /> : muted ? <LuBellRing /> : <LuBellOff />}
      {muted ? `Unmute ${symbol}` : `Mute ${symbol}`}
    </Button>
  )
}
