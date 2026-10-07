import type { Metadata } from "next"
import { LuBellRing, LuMonitor, LuSmartphone } from "react-icons/lu"
import { formatDateTimeET } from "@/core/format"
import {
  COLLECTIONS,
  MEMBER_SUBCOLLECTIONS,
  fcmTokenSchema,
  parseDoc,
  sessionSchema,
  type FcmTokenDoc,
  type SessionDoc,
} from "@/server/model"
import { requireViewer } from "@/lib/auth/guards"
import { readSession } from "@/lib/auth/session"
import { adminDb } from "@/lib/firebase/admin"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { RevokeSessionButton, SessionBulkActions } from "@/components/portal/settings/account-actions"
import { SettingsNav } from "@/components/portal/settings/settings-nav"
import { RelativeTime } from "@/components/shared/relative-time"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Sessions" }

/** A readable "Chrome on macOS" from a user agent string. */
function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown browser", mobile: false }
  if (!ua.includes("/")) return { label: ua, mobile: /iphone|android/i.test(ua) }
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser"
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "an unknown system"
  return { label: `${browser} on ${os}`, mobile: /iPhone|Android|Mobile/.test(ua) }
}

export default async function SessionsPage() {
  const viewer = await requireViewer("/members/settings/sessions")
  const current = await readSession()
  const member = adminDb().collection(COLLECTIONS.members).doc(viewer.uid)
  const [sessionsSnap, tokensSnap] = await Promise.all([
    member.collection(MEMBER_SUBCOLLECTIONS.sessions).orderBy("lastSeenAt", "desc").get(),
    member.collection(MEMBER_SUBCOLLECTIONS.fcmTokens).get(),
  ])
  const sessions = sessionsSnap.docs
    .map((d) => parseDoc(sessionSchema, d.id, d.data()))
    .filter((s): s is SessionDoc => s !== null)
  const tokens = tokensSnap.docs
    .map((d) => parseDoc(fcmTokenSchema, d.id, d.data()))
    .filter((t): t is FcmTokenDoc => t !== null)
  return (
    <>
      <PageHeader
        title="Settings"
        description="Where you are signed in. Membership allows two signed-in browsers at a time; a new sign-in signs out the oldest."
      />
      <SettingsNav />
      <Card>
        <CardHeader>
          <CardTitle>Signed-in browsers</CardTitle>
          <CardDescription>Sign out anything you do not recognize, then change your password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y rounded-lg border">
            {sessions.map((s) => {
              const agent = describeAgent(s.userAgent)
              const notifies = tokens.some((t) => t.sessionId === s.id)
              const isCurrent = s.id === current?.sid
              const Icon = agent.mobile ? LuSmartphone : LuMonitor
              return (
                <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {agent.label}
                        {isCurrent && <ToneBadge tone="positive">This browser</ToneBadge>}
                        {notifies && (
                          <ToneBadge tone="muted">
                            <LuBellRing aria-hidden="true" />
                            Notifications on
                          </ToneBadge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Active <RelativeTime iso={s.lastSeenAt.toISOString()} /> · signed in{" "}
                        {formatDateTimeET(s.createdAt)}
                        {s.ip && ` · IP ${s.ip}`}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && <RevokeSessionButton sessionId={s.id} />}
                </li>
              )
            })}
          </ul>
          <SessionBulkActions others={sessions.filter((s) => s.id !== current?.sid).length} />
        </CardContent>
      </Card>
    </>
  )
}
