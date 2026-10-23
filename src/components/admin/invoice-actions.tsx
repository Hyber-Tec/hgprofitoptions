"use client"

import { useState, useTransition } from "react"
import { LuEllipsis } from "react-icons/lu"
import { setInvoiceStatus } from "@/lib/actions/admin/invoices"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

/** Paid, unpaid again, or cancelled. An invoice is never edited or deleted, so its number stays taken. */
export function InvoiceActions({
  id,
  number,
  status,
}: {
  id: string
  number: string
  status: "open" | "paid" | "void"
}) {
  const [pending, startTransition] = useTransition()
  const [confirmVoid, setConfirmVoid] = useState(false)
  const set = (next: "open" | "paid" | "void", success: string) =>
    startTransition(async () => {
      const result = await setInvoiceStatus(id, { status: next, paidOn: null })
      toast.add(
        result.ok
          ? { title: success, type: "success" }
          : { title: "Not changed", description: result.message, type: "error" },
      )
    })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Change ${number}`} disabled={pending} />}
        >
          {pending ? <Spinner /> : <LuEllipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {status !== "paid" && (
            <DropdownMenuItem onClick={() => set("paid", `${number} marked as paid`)}>
              Mark as paid today
            </DropdownMenuItem>
          )}
          {status !== "open" && (
            <DropdownMenuItem onClick={() => set("open", `${number} marked as unpaid`)}>
              Mark as unpaid
            </DropdownMenuItem>
          )}
          {status !== "void" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmVoid(true)}>
                Cancel invoice
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmVoid} onOpenChange={setConfirmVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The member no longer sees it. It stays in this list as cancelled, and you can issue a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => set("void", `${number} cancelled`)}>
              Cancel invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
