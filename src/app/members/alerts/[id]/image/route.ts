import { getViewer } from "@/lib/auth/guards"
import { getAlert } from "@/lib/data/alerts"
import { readStoredFile } from "@/lib/data/content"

/** The chart image attached to an alert, for members with access only. */
export async function GET(_request: Request, { params }: RouteContext<"/members/alerts/[id]/image">) {
  const { id } = await params
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const alert = await getAlert(id)
  const visible = alert && (alert.status === "published" || alert.status === "closed" || viewer.role === "admin")
  if (!alert?.imagePath || !visible) return new Response("Not found", { status: 404 })
  const { data, contentType } = await readStoredFile(alert.imagePath)
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
