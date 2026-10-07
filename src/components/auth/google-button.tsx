"use client"

import { FcGoogle } from "react-icons/fc"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function GoogleButton({ onClick, pending, label = "Continue with Google", disabled }: { onClick: () => void; pending: boolean; label?: string; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="lg" onClick={onClick} disabled={pending || disabled}>
      {pending ? <Spinner data-icon="inline-start" /> : <FcGoogle data-icon="inline-start" />}
      {label}
    </Button>
  )
}
