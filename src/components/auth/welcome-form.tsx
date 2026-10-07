"use client"

import { createUserWithEmailAndPassword } from "firebase/auth"
import { FirebaseError } from "firebase/app"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type SubmitEvent } from "react"
import { authErrorMessage, establishSession, signInWithGoogle, type SignInResult } from "@/lib/auth/client"
import { clearOrphanedInviteLogin } from "@/lib/actions/auth"
import { clientAuth } from "@/lib/firebase/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { GoogleButton } from "./google-button"
import { PasswordInput } from "./password-input"

export function WelcomeForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<"password" | "google" | null>(null)

  const finish = (result: SignInResult) => {
    setPending(null)
    if (result.kind === "ok") {
      router.replace("/members?welcome=1")
      router.refresh()
    } else if (result.kind === "error") {
      setError(result.message)
    } else {
      setError("Two-step verification is not expected for a new account.")
    }
  }

  const onGoogle = async () => {
    setError(null)
    setPending("google")
    finish(await signInWithGoogle({ inviteToken: token, acceptTerms: true, loginHint: email }))
  }

  const create = async () => (await createUserWithEmailAndPassword(clientAuth(), email, password)).user

  const onPassword = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("The passwords do not match.")
      return
    }
    setPending("password")
    try {
      let user
      try {
        user = await create()
      } catch (err) {
        if (
          err instanceof FirebaseError &&
          err.code === "auth/email-already-in-use" &&
          (await clearOrphanedInviteLogin(token)).ok
        )
          user = await create()
        else throw err
      }
      finish(await establishSession(user, { inviteToken: token, acceptTerms: true }))
    } catch (err) {
      setPending(null)
      setError(authErrorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field orientation="horizontal">
        <Checkbox id="terms" checked={accepted} onCheckedChange={(v) => setAccepted(v)} />
        <FieldLabel htmlFor="terms" className="text-sm leading-snug font-normal">
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" target="_blank" className="underline underline-offset-4">
              membership terms
            </Link>{" "}
            and have read the{" "}
            <Link href="/legal/risk-disclosure" target="_blank" className="underline underline-offset-4">
              risk disclosure
            </Link>
            .
          </span>
        </FieldLabel>
      </Field>
      <GoogleButton
        onClick={onGoogle}
        pending={pending === "google"}
        disabled={!accepted || pending !== null}
        label={`Continue with Google`}
      />
      <FieldSeparator>or create a password</FieldSeparator>
      <form onSubmit={onPassword} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="new-password">Password</FieldLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={!accepted || pending !== null}>
          {pending === "password" && <Spinner data-icon="inline-start" />}
          Create account
        </Button>
      </form>
    </div>
  )
}
