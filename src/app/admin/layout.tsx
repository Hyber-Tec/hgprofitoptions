import type { Metadata } from "next"
import { requireEditor } from "@/lib/auth/guards"
import { PortalShell } from "@/components/portal/portal-shell"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

/**
 * Admins and data editors. Pages call requireAdmin() or requireEditor() themselves; the layout allows the
 * two-step setup page without MFA.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireEditor({ allowWithoutMfa: true })
  return (
    <PortalShell area="admin" viewer={viewer}>
      {children}
    </PortalShell>
  )
}
