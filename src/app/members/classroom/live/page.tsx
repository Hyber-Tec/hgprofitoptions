import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LuLogOut } from "react-icons/lu"
import { SiZoom } from "react-icons/si"
import { classMeetingNumber } from "@/core/zoom"
import { requireActiveMember } from "@/lib/auth/guards"
import { getMemberSettings } from "@/lib/data/settings"
import { integrations } from "@/lib/env.server"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Live class" }

export default async function LiveClassPage() {
  await requireActiveMember("/members/classroom/live")
  const settings = await getMemberSettings()
  if (!integrations.zoomEmbed || !classMeetingNumber(settings)) redirect("/members/classroom")
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Live class</h1>
        <div className="flex items-center gap-2">
          {settings.zoomUrl && (
            <ButtonAnchor variant="outline" size="sm" href={settings.zoomUrl} target="_blank" rel="noopener noreferrer">
              <SiZoom />
              Zoom app
            </ButtonAnchor>
          )}
          <ButtonLink variant="ghost" size="sm" href="/members/classroom">
            <LuLogOut />
            Leave
          </ButtonLink>
        </div>
      </div>
      {/* Zoom's own screens ask for the microphone and camera and show its errors. */}
      <iframe
        src="/members/classroom/live/frame"
        title="Live class"
        allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
        className="h-[calc(100svh-9.5rem)] min-h-96 w-full rounded-xl border bg-black sm:h-[calc(100svh-11rem)] lg:h-[calc(100svh-12.5rem)]"
      />
    </>
  )
}
