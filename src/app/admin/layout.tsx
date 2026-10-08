import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { PortalShell } from "@/components/portal/portal-shell"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

/** Pages call requireAdmin() themselves; the layout allows the two-step setup page without MFA. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireAdmin({ allowWithoutMfa: true })
  return (
    <PortalShell area="admin" viewer={viewer}>
      {children}
    </PortalShell>
  )
}
