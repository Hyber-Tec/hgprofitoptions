import { NextResponse } from "next/server"
import { z } from "zod"
import { AccessError } from "@/lib/auth/ensure-member"
import { SESSION_COOKIE, createSession, destroySession } from "@/lib/auth/session"
import { clientIp, isSameOrigin } from "@/lib/http"

const bodySchema = z.object({
  idToken: z.string().min(10),
  inviteToken: z.string().min(10).max(200).optional(),
  acceptTerms: z.boolean().optional(),
})

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid-request" }, { status: 400 })

  try {
    const { cookieValue, maxAgeSeconds, member } = await createSession({
      idToken: parsed.data.idToken,
      ...(parsed.data.inviteToken ? { inviteToken: parsed.data.inviteToken } : {}),
      ...(parsed.data.acceptTerms ? { acceptTerms: true } : {}),
      userAgent: request.headers.get("user-agent"),
      ip: clientIp(request),
    })
    const response = NextResponse.json({ ok: true, role: member.role })
    response.cookies.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    })
    return response
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.code, message: error.message }, { status: 403 })
    console.error("session creation failed", error)
    return NextResponse.json({ error: "sign-in-failed", message: "We could not sign you in. Please try again." }, { status: 401 })
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  await destroySession()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 })
  return response
}
