"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuLogOut, LuTrash2, LuUndo2 } from "react-icons/lu"
import {
  cancelAccountDeletion,
  requestAccountDeletion,
  revokeOtherSessions,
  revokeSession,
  signOutEverywhere,
} from "@/lib/actions/settings"
import { signOut } from "@/lib/auth/client"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

export function DeletionRequest({ requestedAt }: { requestedAt: string | null }) {
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  if (requestedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          You asked HG to delete your account on {new Date(requestedAt).toLocaleDateString()}. HG will confirm before
          anything is removed.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await cancelAccountDeletion()
            })
          }
        >
          <LuUndo2 />
          Cancel request
        </Button>
      </div>
    )
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
        <LuTrash2 />
        Request account deletion
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            HG will delete your login, profile, journal and any linked brokerage data. Export your journal first if you
            want to keep it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Anything HG should know? (optional)"
          rows={3}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my account</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await requestAccountDeletion(reason)
                toast.add(
                  result.ok
                    ? {
                        title: "Request sent",
                        description: "HG will confirm before your data is removed.",
                        type: "success",
                      }
                    : { title: "Not sent", description: result.message, type: "error" },
                )
              })
            }
          >
            {pending && <Spinner />}
            Send request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await revokeSession(sessionId)
        })
      }
    >
      {pending ? <Spinner /> : <LuLogOut />}
      Sign out
    </Button>
  )
}

export function SessionBulkActions({ others }: { others: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending || others === 0}
        onClick={() =>
          startTransition(async () => {
            const result = await revokeOtherSessions()
            if (result.ok)
              toast.add({
                title: `Signed out of ${result.data.count} other ${result.data.count === 1 ? "browser" : "browsers"}`,
                type: "success",
              })
          })
        }
      >
        Sign out other browsers
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Sign out everywhere</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              Every browser and device is signed out, including this one. Use this if you lost a device or shared your
              password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  await signOutEverywhere()
                  await signOut()
                  router.replace("/login")
                })
              }
            >
              Sign out everywhere
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
