import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { getViewer } from "@/lib/auth/guards"

export const metadata: Metadata = { title: "Member login", robots: { index: false } }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams
  const viewer = await getViewer()
  if (viewer) redirect(viewer.role === "admin" ? "/admin" : "/members")
  return <LoginForm next={typeof next === "string" ? next : null} />
}
