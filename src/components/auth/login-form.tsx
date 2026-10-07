"use client"

import type { MultiFactorResolver } from "firebase/auth"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type SubmitEvent } from "react"
import { signInWithGoogle, signInWithPassword, type SignInResult } from "@/lib/auth/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { GoogleButton } from "./google-button"
import { PasswordInput } from "./password-input"
import { TotpStep } from "./totp-step"

/** Only same-site paths are allowed as a post-login destination. */
function safeNext(next: string | null, role: "admin" | "member"): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next
  return role === "admin" ? "/admin" : "/members"
}

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<"password" | "google" | null>(null)
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null)

  const finish = (result: SignInResult) => {
    setPending(null)
    if (result.kind === "ok") {
      router.replace(safeNext(next, result.role))
      router.refresh()
    } else if (result.kind === "mfa") {
      setResolver(result.resolver)
    } else {
      setError(result.message)
    }
  }

  const onPassword = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending("password")
    finish(await signInWithPassword(email.trim(), password))
  }

  const onGoogle = async () => {
    setError(null)
    setPending("google")
    finish(await signInWithGoogle())
  }

  if (resolver) return <TotpStep resolver={resolver} onDone={finish} onCancel={() => setResolver(null)} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Member login</h1>
        <p className="text-sm text-muted-foreground">Sign in to your HG Profit Options account.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <GoogleButton onClick={onGoogle} pending={pending === "google"} disabled={pending !== null} />
      <FieldSeparator>or</FieldSeparator>
      <form onSubmit={onPassword} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot password?
              </Link>
            </div>
            <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={pending !== null}>
          {pending === "password" && <Spinner data-icon="inline-start" />}
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Not a member yet?{" "}
        <Link href="/book" target="_blank" rel="noopener" className="font-medium text-foreground underline-offset-4 hover:underline">
          Book a free intro call
        </Link>
      </p>
    </div>
  )
}
