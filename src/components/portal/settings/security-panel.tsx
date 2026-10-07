"use client"

import { FirebaseError } from "firebase/app"
import {
  TotpMultiFactorGenerator,
  multiFactor,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type MultiFactorInfo,
  type TotpSecret,
  type User,
} from "firebase/auth"
import QRCode from "qrcode"
import { useEffect, useReducer, useState, useTransition, type SubmitEvent } from "react"
import { LuKeyRound, LuShieldCheck, LuShieldOff } from "react-icons/lu"
import { clientAuth } from "@/lib/firebase/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

function message(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/requires-recent-login")
      return "For your security, sign out and sign in again, then try once more."
    if (error.code === "auth/invalid-verification-code")
      return "That code is not correct. Use the newest code from your app."
    if (error.code === "auth/operation-not-allowed" || error.code === "auth/unsupported-first-factor")
      return "Two-step verification is not available for this sign-in method."
  }
  return "Something went wrong. Please try again."
}

function useClientUser(uid: string): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(clientAuth(), (u) => setUser(u?.uid === uid ? u : null)), [uid])
  return user
}

export function PasswordReset({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <LuKeyRound className="size-4" /> Password
        </p>
        <p className="text-sm text-muted-foreground">
          {hasPassword
            ? "We will email you a secure link to choose a new password."
            : "You sign in with Google. You can also add a password with a reset link."}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await sendPasswordResetEmail(clientAuth(), email)
              toast.add({ title: "Check your email", description: `A link was sent to ${email}.`, type: "success" })
            } catch {
              toast.add({ title: "Email not sent", description: "Please try again in a minute.", type: "error" })
            }
          })
        }
      >
        {pending && <Spinner />}
        {hasPassword ? "Change password" : "Set a password"}
      </Button>
    </div>
  )
}

/** Turn authenticator-app (TOTP) two-step verification on or off. */
export function TwoStepSetup({
  uid,
  email,
  required = false,
  onEnrolled,
}: {
  uid: string
  email: string
  required?: boolean
  onEnrolled?: () => void
}) {
  const user = useClientUser(uid)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [secret, setSecret] = useState<TotpSecret | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (user === undefined) return <Spinner className="text-muted-foreground" />
  if (user === null)
    return (
      <p className="text-sm text-muted-foreground">
        Sign out and sign in again on this device to manage two-step verification.
      </p>
    )
  const factors: MultiFactorInfo[] = multiFactor(user).enrolledFactors.filter(
    (f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  )

  const start = () =>
    startTransition(async () => {
      setError(null)
      try {
        const session = await multiFactor(user).getSession()
        const generated = await TotpMultiFactorGenerator.generateSecret(session)
        setSecret(generated)
        setQr(
          await QRCode.toDataURL(generated.generateQrCodeUrl(email, "HG Profit Options"), { margin: 1, width: 200 }),
        )
      } catch (e) {
        setError(message(e))
      }
    })

  const verify = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!secret) return
    startTransition(async () => {
      setError(null)
      try {
        await multiFactor(user).enroll(
          TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s/g, "")),
          "Authenticator app",
        )
        rerender()
        setSecret(null)
        setQr(null)
        setCode("")
        toast.add({
          title: "Two-step verification is on",
          description: "You will be asked for a code when you sign in.",
          type: "success",
        })
        onEnrolled?.()
      } catch (e) {
        setError(message(e))
      }
    })
  }

  const remove = (factor: MultiFactorInfo) =>
    startTransition(async () => {
      setError(null)
      try {
        await multiFactor(user).unenroll(factor)
        rerender()
        toast.add({ title: "Two-step verification is off", type: "success" })
      } catch (e) {
        setError(message(e))
      }
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <LuShieldCheck className="size-4" /> Two-step verification
          </p>
          <p className="text-sm text-muted-foreground">
            {factors.length > 0
              ? "On. Sign-ins ask for a code from your authenticator app."
              : required
                ? "Required for admins. Use Google Authenticator, 1Password, Authy or similar."
                : "Optional. Adds a 6-digit code from an authenticator app at sign-in."}
          </p>
        </div>
        {factors.length > 0
          ? !required && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => factors[0] && remove(factors[0])}>
                <LuShieldOff />
                Turn off
              </Button>
            )
          : !secret && (
              <Button size="sm" disabled={pending} onClick={start}>
                {pending && <Spinner />}
                Turn on
              </Button>
            )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {secret && qr && (
        <form onSubmit={verify} className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img
            src={qr}
            alt="QR code for your authenticator app"
            width={176}
            height={176}
            className="rounded-lg border bg-white p-2"
          />
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-sm">Scan the code with your authenticator app, then enter the 6-digit code it shows.</p>
            <p className="text-xs text-muted-foreground">
              Cannot scan? Enter this key:{" "}
              <span className="font-mono break-all text-foreground">{secret.secretKey}</span>
            </p>
            <Field className="max-w-48">
              <FieldLabel htmlFor="enroll-code">Code</FieldLabel>
              <Input
                id="enroll-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="num tracking-[0.3em]"
                required
              />
              <FieldDescription>Codes change every 30 seconds.</FieldDescription>
            </Field>
            <div>
              <Button type="submit" disabled={pending || code.replace(/\s/g, "").length !== 6}>
                {pending && <Spinner />}
                Verify and turn on
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
