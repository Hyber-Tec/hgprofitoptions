"use client"

import { useState, useTransition } from "react"
import { LuUnlink } from "react-icons/lu"
import { disconnectBrokerage } from "@/lib/actions/brokerage"
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
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

export function DisconnectButton({ connectionId, name }: { connectionId: string; name: string }) {
  const [keep, setKeep] = useState("keep")
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        <LuUnlink />
        Disconnect
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Syncing stops right away. Choose what happens to what was already synced.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup value={keep} onValueChange={(v: unknown) => setKeep(String(v))} className="gap-3">
          <Label className="flex items-start gap-3 rounded-lg border p-3 font-normal">
            <RadioGroupItem value="keep" className="mt-0.5" />
            <span>
              <span className="block font-medium">Keep my synced trades and history</span>
              <span className="block text-sm text-muted-foreground">
                Your journal keeps the trades and their notes.
              </span>
            </span>
          </Label>
          <Label className="flex items-start gap-3 rounded-lg border p-3 font-normal">
            <RadioGroupItem value="delete" className="mt-0.5" />
            <span>
              <span className="block font-medium">Delete the synced data</span>
              <span className="block text-sm text-muted-foreground">
                Accounts, holdings, history and brokerage trades are removed.
              </span>
            </span>
          </Label>
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await disconnectBrokerage(connectionId, keep === "keep")
                toast.add(
                  result.ok
                    ? { title: `${name} disconnected`, type: "success" }
                    : { title: "Not disconnected", description: result.message, type: "error" },
                )
              })
            }
          >
            {pending && <Spinner />}
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
