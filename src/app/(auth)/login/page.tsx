import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { getViewer } from "@/lib/auth/guards"
import { getSiteSettings } from "@/lib/data/public"

export const metadata: Metadata = { title: "Member login", robots: { index: false } }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams
  const [viewer, { trial }] = await Promise.all([getViewer(), getSiteSettings()])
  if (viewer) redirect(viewer.role === "member" ? "/members" : "/admin")
  return <LoginForm next={typeof next === "string" ? next : null} trialDays={trial.enabled ? trial.days : null} />
}
