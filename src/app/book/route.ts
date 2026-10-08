import { NextResponse } from "next/server"
import { getSiteSettings } from "@/lib/data/public"

/** One place to change the booking link: Admin > Settings. */
export async function GET() {
  const settings = await getSiteSettings()
  return NextResponse.redirect(settings.bookingUrl, 302)
}
