"use client"

import { useTransition } from "react"
import { LuCalendarPlus } from "react-icons/lu"
import { renewNextQuarter } from "@/lib/actions/admin/members"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

export function RenewButton({ uid, name }: { uid: string; name: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await renewNextQuarter([uid])
          const failure = result.ok ? result.data.failed[0] : undefined
          if (result.ok && !failure) toast.add({ title: `${name} renewed for the next quarter`, type: "success" })
          else
            toast.add({
              title: "Not renewed",
              description: result.ok ? failure?.message : result.message,
              type: "error",
            })
        })
      }
    >
      {pending ? <Spinner /> : <LuCalendarPlus />}
      Renew
    </Button>
  )
}
