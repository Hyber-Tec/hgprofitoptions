import type { ReactNode } from "react"
import { LuCalendarCheck, LuLock, LuMessagesSquare } from "react-icons/lu"
import { plural } from "@/core/format"
import { getSiteSettings } from "@/lib/data/public"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

/** The two ways forward from a free trial: join (a call with HG) or ask a question. */
function TrialActions() {
  return (
    <>
      <ButtonAnchor size="sm" href="/book" target="_blank" rel="noopener">
        <LuCalendarCheck />
        Book a call to join
      </ButtonAnchor>
      <ButtonLink size="sm" variant="outline" href="/members/chat">
        <LuMessagesSquare />
        Ask HG a question
      </ButtonLink>
    </>
  )
}

/**
 * Where a free trial meets HG's newest posts: what is held back and when it opens. `children` names what
 * is waiting, for example "3 newer alerts for members"; `description` replaces the usual line about when.
 */
export async function HeldBackNotice({ children, description }: { children: ReactNode; description?: string }) {
  const { trial } = await getSiteSettings()
  return (
    <Card size="sm" className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuLock className="size-4 text-muted-foreground" aria-hidden="true" />
          {children}
        </CardTitle>
        <CardDescription>
          {description ??
            `Members see them the moment HG posts them. On your free trial they open here after ${plural(trial.delayDays, "day")}.`}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <TrialActions />
      </CardFooter>
    </Card>
  )
}

/** The dashboard's welcome for a free trial: how long it lasts and what it includes. */
export async function TrialCard({ daysLeft }: { daysLeft: number }) {
  const { trial } = await getSiteSettings()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your free trial</CardTitle>
        <CardDescription>
          {daysLeft === 0 ? "Last day today" : `${plural(daysLeft, "day")} left`} · ask anything, any time
        </CardDescription>
        <CardAction>
          <LuLock className="size-4 text-muted-foreground" aria-hidden="true" />
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Join the live classes, use every tool and ask questions in Chat. HG&apos;s alerts, strike targets and market
        briefs show here {plural(trial.delayDays, "day")} after he posts them; members get them the moment they are
        posted.
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
        <TrialActions />
      </CardFooter>
    </Card>
  )
}
