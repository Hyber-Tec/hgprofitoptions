import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { TrialForm } from "@/components/auth/trial-form"
import { getViewer } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"
import { ButtonAnchor } from "@/components/shared/button-link"

export const metadata: Metadata = {
  title: "Free trial",
  description: "Try the HG Profit Options member area free: the classroom, the tools and Chat.",
}

export default async function TrialPage() {
  const [viewer, { trial }] = await Promise.all([getViewer(), getSiteSettings()])
  if (viewer) redirect(viewer.role === "member" ? "/members" : "/admin")
  if (!trial.enabled)
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Free trials are paused</h1>
          <p className="text-sm text-muted-foreground">
            Book a free 15-minute call with HG and he will show you around the member area.
          </p>
        </div>
        <ButtonAnchor href="/book" target="_blank" rel="noopener">
          Book a free call
        </ButtonAnchor>
      </div>
    )
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Free trial</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Try the member area free for {trial.days} {trial.days === 1 ? "day" : "days"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Join the live classes, use the tools, and ask HG and the team anything in Chat. HG&apos;s newest alerts and
          strike targets open up when you join.
        </p>
      </div>
      <TrialForm />
      <p className="text-sm text-pretty text-muted-foreground">
        Already a member?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Log in
        </Link>
        . Rather talk first?{" "}
        <a
          href="/book"
          target="_blank"
          rel="noopener"
          className="whitespace-nowrap text-foreground underline underline-offset-4"
        >
          Book a free call
        </a>
        .
      </p>
    </div>
  )
}
