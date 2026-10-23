import { classMeetingNumber } from "@/core/zoom"
import { meetingSdkSignature } from "@/server/zoom"
import { zoomFrameHtml } from "@/server/zoom-frame"
import { getViewer } from "@/lib/auth/guards"
import { getMemberSettings } from "@/lib/data/settings"
import { zoomSdkConfig } from "@/lib/env.server"

/** The live class frame: Zoom's web client, signed in as this member for the weekly class meeting. */
export async function GET() {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const sdk = zoomSdkConfig()
  const settings = await getMemberSettings()
  const meetingNumber = classMeetingNumber(settings)
  if (!sdk || !meetingNumber) return new Response("Not found", { status: 404 })
  const html = zoomFrameHtml(
    {
      signature: meetingSdkSignature(sdk, meetingNumber),
      meetingNumber,
      passWord: settings.zoomPasscode ?? "",
      userName: viewer.fullName,
      userEmail: viewer.email,
    },
    "/members/classroom/live/left",
  )
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  })
}
