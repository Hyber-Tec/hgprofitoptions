import { adminForAction } from "@/lib/auth/guards"
import { getRecap } from "@/lib/data/recaps"
import { adminBucket } from "@/lib/firebase/admin"

/** The class transcript behind a recap, for admins only. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/recaps/[id]/transcript">) {
  const viewer = await adminForAction()
  if (!viewer) return new Response("Not found", { status: 404 })
  const { id } = await params
  const recap = await getRecap(id)
  const path = recap?.transcript.path
  if (!recap || !path) return new Response("Not found", { status: 404 })
  const [data] = await adminBucket().file(path).download()
  const name = (recap.transcript.name ?? `${recap.title} ${recap.date}.txt`).replace(/["\\\r\n]/g, "")
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": recap.transcript.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
