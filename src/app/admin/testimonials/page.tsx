import type { Metadata } from "next"
import { COLLECTIONS, parseDoc, testimonialSchema, type TestimonialDoc } from "@/server/model"
import { requireAdmin } from "@/lib/auth/guards"
import { adminDb } from "@/lib/firebase/admin"
import { TestimonialsManager } from "@/components/admin/public-content-managers"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Testimonials" }

export default async function AdminTestimonialsPage() {
  await requireAdmin({ next: "/admin/testimonials" })
  const snap = await adminDb().collection(COLLECTIONS.testimonials).get()
  const items = snap.docs
    .map((d) => parseDoc(testimonialSchema, d.id, d.data()))
    .filter((t): t is TestimonialDoc => t !== null)
    .sort((a, b) => a.order - b.order)
  return (
    <>
      <PageHeader title="Testimonials" description="Member stories on the home page, in this order." />
      <TestimonialsManager
        items={items.map((t) => ({
          id: t.id,
          name: t.name,
          location: t.location,
          avatar: t.avatar,
          flag: t.flag,
          quote: t.quote,
          trade: t.trade,
          published: t.published,
          order: t.order,
        }))}
      />
    </>
  )
}
