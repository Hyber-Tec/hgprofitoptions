import { zoomLeftHtml } from "@/server/zoom-frame"

/** Zoom's "leave URL" for the live class frame: back to the Classroom. */
export function GET() {
  return new Response(zoomLeftHtml("/members/classroom"), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}
