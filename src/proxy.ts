import { NextResponse, type NextRequest } from "next/server"

/**
 * Routing only: visitors without a session cookie are sent to /login before any member or admin
 * page renders. Real authorization happens on the server in requireActiveMember / requireAdmin.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("__session")) return NextResponse.next()
  const url = request.nextUrl.clone()
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  url.pathname = "/login"
  url.search = `?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/members/:path*", "/admin/:path*"],
}
