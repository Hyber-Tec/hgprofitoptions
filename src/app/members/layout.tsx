import type { Metadata } from "next"
import { requireViewer } from "@/lib/auth/guards"
import { PortalShell } from "@/components/portal/portal-shell"

export const metadata: Metadata = { title: "Member area", robots: { index: false, follow: false } }

export default async function MembersLayout({ children }: LayoutProps<"/members">) {
  const viewer = await requireViewer()
  return (
    <PortalShell area="members" viewer={viewer}>
      {children}
    </PortalShell>
  )
}
