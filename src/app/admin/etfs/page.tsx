import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { getEtfConfig } from "@/lib/data/tools"
import { EtfEditor } from "@/components/admin/market-forms"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = { title: "Leveraged ETFs" }

export default async function AdminEtfsPage() {
  await requireAdmin({ next: "/admin/etfs" })
  const config = await getEtfConfig()
  return (
    <>
      <PageHeader
        title="Leveraged ETF guide"
        description="The stock and 2x ETF pairs members see, and the guidance above them."
      />
      <Card>
        <CardContent>
          <EtfEditor initial={config} />
        </CardContent>
      </Card>
    </>
  )
}
