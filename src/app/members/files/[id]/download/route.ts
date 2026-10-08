import { getViewer } from "@/lib/auth/guards"
import { getResource } from "@/lib/data/content"
import { serveMemberFile } from "@/lib/pdf/serve"

export async function GET(request: Request, { params }: RouteContext<"/members/files/[id]/download">) {
  const { id } = await params
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const resource = await getResource(id)
  if (!resource || (!resource.published && viewer.role !== "admin")) return new Response("Not found", { status: 404 })
  const download = new URL(request.url).searchParams.get("download") === "1"
  return serveMemberFile(viewer, {
    path: resource.storagePath,
    title: resource.title,
    mimeType: resource.mimeType,
    download,
  })
}
