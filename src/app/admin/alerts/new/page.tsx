import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { composerInitial, composerOptions } from "@/lib/admin/alert-form"
import { AlertComposer } from "@/components/admin/alert-composer"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "New alert" }

export default async function NewAlertPage() {
  await requireAdmin({ next: "/admin/alerts/new" })
  const { symbols, targets } = await composerOptions()
  return (
    <>
      <PageHeader
        title="New alert"
        description="Members see it in the app and get a notification the moment you publish."
      />
      <AlertComposer
        initial={composerInitial(null)}
        symbols={symbols}
        targets={targets}
        emailAvailable={integrations.email}
      />
    </>
  )
}
