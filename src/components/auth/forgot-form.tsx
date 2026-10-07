"use client"

import { sendPasswordResetEmail } from "firebase/auth"
import Link from "next/link"
import { useState, type SubmitEvent } from "react"
import { LuMail } from "react-icons/lu"
import { clientAuth } from "@/lib/firebase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function ForgotForm() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    // The answer is the same whether or not the account exists, so emails cannot be probed.
    await sendPasswordResetEmail(clientAuth(), email.trim(), { url: `${window.location.origin}/login` }).catch(() => undefined)
    setPending(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <LuMail className="size-6" />
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">If an account exists for {email}, we sent a link to reset your password. The link expires in one hour.</p>
        <Button variant="outline" render={<Link href="/login" />} nativeButton={false}>
          Back to login
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Enter your email and we will send you a reset link.</p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Send reset link
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Back to login
      </Link>
    </form>
  )
}
