import type { Metadata } from "next"
import { ForgotForm } from "@/components/auth/forgot-form"

export const metadata: Metadata = { title: "Reset password", robots: { index: false } }

export default function ForgotPasswordPage() {
  return <ForgotForm />
}
