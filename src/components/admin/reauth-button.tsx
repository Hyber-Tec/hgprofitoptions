"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LuLogIn } from "react-icons/lu"
import { signOut } from "@/lib/auth/client"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** After turning on two-step verification, sign in again so the session carries the second factor. */
export function ReauthButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut()
          router.replace("/login?next=%2Fadmin")
        })
      }
    >
      {pending ? <Spinner /> : <LuLogIn />}
      Sign in again with my code
    </Button>
  )
}
