import { getViewer } from "@/lib/auth/guards"
import { readStoredFile } from "@/lib/data/content"
import { getTrade } from "@/lib/data/journal"

/** A journal screenshot, for its owner only. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/members/journal/[tradeId]/screenshots/[index]">,
) {
  const { tradeId, index } = await params
  const viewer = await getViewer()
  if (!viewer) return new Response("Not found", { status: 404 })
  const trade = await getTrade(viewer.uid, tradeId)
  const path = trade?.screenshots[Number(index)]
  if (!path) return new Response("Not found", { status: 404 })
  const { data, contentType } = await readStoredFile(path)
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType ?? "image/png",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
