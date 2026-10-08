import type { Metadata } from "next"
import { FAQ_GROUPS } from "@/content/faqs"
import { COLLECTIONS, faqSchema, parseDoc, type FaqDoc } from "@/server/model"
import { requireAdmin } from "@/lib/auth/guards"
import { adminDb } from "@/lib/firebase/admin"
import { FaqManager } from "@/components/admin/public-content-managers"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "FAQ" }

export default async function AdminFaqPage() {
  await requireAdmin({ next: "/admin/faq" })
  const snap = await adminDb().collection(COLLECTIONS.faqs).get()
  const items = snap.docs.map((d) => parseDoc(faqSchema, d.id, d.data())).filter((f): f is FaqDoc => f !== null)
  return (
    <>
      <PageHeader title="FAQ" description="Questions and answers on the public FAQ page." />
      <FaqManager
        items={items.map((f) => ({
          id: f.id,
          group: f.group,
          question: f.question,
          subtitle: f.subtitle,
          answer: f.answer,
          published: f.published,
          order: f.order,
        }))}
        groups={[...FAQ_GROUPS]}
      />
    </>
  )
}
