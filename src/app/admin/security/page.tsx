import type { Metadata } from "next"
import { LuShieldCheck } from "react-icons/lu"
import { adminMfaRequired, requireAdmin } from "@/lib/auth/guards"
import { ReauthButton } from "@/components/admin/reauth-button"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { TwoStepSetup } from "@/components/portal/settings/security-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = { title: "Admin security" }

export default async function AdminSecurityPage() {
  const viewer = await requireAdmin({ next: "/admin/security", allowWithoutMfa: true })
  const locked = adminMfaRequired && !viewer.mfa
  return (
    <>
      <PageHeader
        title="Admin security"
        description="Admins can see every member's data, so the admin console requires two-step verification."
      />
      {locked && (
        <Alert>
          <LuShieldCheck />
          <AlertTitle>Two-step verification is required</AlertTitle>
          <AlertDescription>
            Turn it on below, then sign in again with your code. Until then the rest of the admin console stays locked;
            the member area works as usual.
          </AlertDescription>
        </Alert>
      )}
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col gap-5">
          <TwoStepSetup uid={viewer.uid} email={viewer.email} required />
          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">This session</p>
              <p className="text-sm text-muted-foreground">
                {viewer.mfa
                  ? "You signed in with a code."
                  : locked
                    ? "You signed in without a code. Sign in again and enter one to open the admin console."
                    : "You signed in without a code."}
              </p>
            </div>
            {viewer.mfa ? <ToneBadge tone="positive">Verified</ToneBadge> : <ReauthButton />}
          </div>
        </CardContent>
      </Card>
      {!adminMfaRequired && (
        <p className="text-xs text-muted-foreground">
          Local development: two-step verification is not enforced because the Auth emulator does not support it.
        </p>
      )}
    </>
  )
}
