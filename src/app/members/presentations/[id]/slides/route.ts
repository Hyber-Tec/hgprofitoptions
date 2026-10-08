import { getViewer } from "@/lib/auth/guards"
import { getPresentation } from "@/lib/data/content"
import { serveMemberFile } from "@/lib/pdf/serve"

export async function GET(request: Request, { params }: RouteContext<"/members/presentations/[id]/slides">) {
  const { id } = await params
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const presentation = await getPresentation(id)
  if (!presentation?.slidesPath || (!presentation.published && viewer.role !== "admin"))
    return new Response("Not found", { status: 404 })
  const download = new URL(request.url).searchParams.get("download") === "1"
  return serveMemberFile(viewer, {
    path: presentation.slidesPath,
    title: `${presentation.sessionDate} ${presentation.title}`,
    mimeType: "application/pdf",
    download,
  })
}
