"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type SubmitEvent } from "react"
import { startTrial } from "@/lib/actions/trial"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

/** Name and email, then the usual welcome page to create a login (Google or a password). */
export function TrialForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [website, setWebsite] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await startTrial({ fullName, email, website })
      if (result.ok) router.push(`/welcome?invite=${encodeURIComponent(result.data.token)}`)
      else setError(result.message)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="trial-name">Full name</FieldLabel>
          <Input
            id="trial-name"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="trial-email">Email</FieldLabel>
          <Input
            id="trial-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldDescription>Next, you create your login with Google or a password.</FieldDescription>
        </Field>
        {/* Hidden from people; bots that fill it in are turned away. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="trial-website">Website</label>
          <input
            id="trial-website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Start my free trial
      </Button>
    </form>
  )
}
