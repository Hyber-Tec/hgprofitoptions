"use client"

import type { MultiFactorResolver } from "firebase/auth"
import { useState, type SubmitEvent } from "react"
import { LuShieldCheck } from "react-icons/lu"
import { completeTotp, type SignInResult } from "@/lib/auth/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function TotpStep({ resolver, onDone, onCancel }: { resolver: MultiFactorResolver; onDone: (result: SignInResult) => void; onCancel: () => void }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await completeTotp(resolver, code.replace(/\s/g, ""))
    setPending(false)
    if (result.kind === "error") setError(result.message)
    else onDone(result)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <LuShieldCheck className="size-6" />
        <h1 className="text-2xl font-semibold tracking-tight">Two-step verification</h1>
        <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="totp">Verification code</FieldLabel>
          <Input id="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="num text-lg tracking-[0.3em]" />
          <FieldDescription>Codes change every 30 seconds.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending || code.replace(/\s/g, "").length !== 6}>
          {pending && <Spinner data-icon="inline-start" />}
          Verify and sign in
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Use a different account
        </Button>
      </div>
    </form>
  )
}
