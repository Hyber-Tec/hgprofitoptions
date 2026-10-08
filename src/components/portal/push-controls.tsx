"use client"

import { useEffect, useState, useSyncExternalStore, useTransition } from "react"
import { LuBellOff, LuBellRing, LuShare, LuSquarePlus, LuX } from "react-icons/lu"
import { sendTestNotification } from "@/lib/actions/notifications"
import type { PushStatus } from "@/lib/push/client"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"

/** The Messaging SDK loads only where these controls are shown, after the page is interactive. */
const pushClient = () => import("@/lib/push/client")

function usePushStatus(): [PushStatus | null, (s: PushStatus) => void] {
  const [status, setStatus] = useState<PushStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    void pushClient()
      .then((push) => push.getPushStatus())
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return [status, setStatus]
}

const DISMISS_KEY = "hg-push-prompt-dismissed"
const noopSubscribe = () => () => {}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

/** Dashboard prompt, shown until notifications are on in this browser (or dismissed). */
export function PushPromptCard() {
  const [status, setStatus] = usePushStatus()
  const [pending, startTransition] = useTransition()
  const storedDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true)
  const [dismissedNow, setDismissedNow] = useState(false)
  const dismissed = storedDismissed || dismissedNow

  if (dismissed || status === null || status === "on" || status === "unsupported") return null

  const turnOn = () =>
    startTransition(async () => {
      const result = await (await pushClient()).enablePush()
      if (result.ok) {
        setStatus("on")
        toast.add({
          title: "Notifications are on",
          description: "HG's alerts will now reach this device.",
          type: "success",
        })
      } else {
        toast.add({ title: "Notifications are off", description: result.message, type: "error" })
        setStatus(await (await pushClient()).getPushStatus())
      }
    })

  const dismiss = () => {
    setDismissedNow(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Ignore storage errors.
    }
  }

  return (
    <Card className="border-foreground/15 bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuBellRing className="size-4" />
          Get HG&apos;s alerts instantly
        </CardTitle>
        <CardDescription>
          {status === "ios-install"
            ? "On iPhone and iPad, notifications work after you add this site to your Home Screen."
            : status === "denied"
              ? "Notifications are blocked for this site. Allow them in your browser's site settings, then reload."
              : "Turn on notifications so buy and sell points reach you the moment HG posts them."}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={dismiss}>
            <LuX />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {status === "ios-install" ? (
          <IosInstallSteps />
        ) : status === "off" ? (
          <Button onClick={turnOn} disabled={pending}>
            {pending ? <Spinner /> : <LuBellRing />}
            Turn on notifications
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function IosInstallSteps() {
  return (
    <ol className="flex flex-col gap-2 text-sm">
      <li className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
          1
        </span>
        Open this site in Safari and tap Share <LuShare className="size-4" aria-label="Share icon" />
      </li>
      <li className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
          2
        </span>
        Choose Add to Home Screen <LuSquarePlus className="size-4" aria-label="Add icon" />
      </li>
      <li className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
          3
        </span>
        Open HG Profit Options from your Home Screen and turn notifications on
      </li>
    </ol>
  )
}

/** Settings control: switch for this browser plus a test button. */
export function PushSettings() {
  const [status, setStatus] = usePushStatus()
  const [pending, startTransition] = useTransition()

  const toggle = (on: boolean) =>
    startTransition(async () => {
      if (on) {
        const result = await (await pushClient()).enablePush()
        if (!result.ok) toast.add({ title: "Notifications are off", description: result.message, type: "error" })
      } else {
        await (await pushClient()).disablePush()
      }
      setStatus(await (await pushClient()).getPushStatus())
    })

  const test = () =>
    startTransition(async () => {
      const result = await sendTestNotification()
      toast.add(
        result.ok
          ? { title: "Test sent", description: "It should arrive within a few seconds.", type: "success" }
          : { title: "Test not sent", description: result.message, type: "error" },
      )
    })

  if (status === null) return <Spinner />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="push-switch" className="text-sm font-medium">
            Notifications on this device
          </label>
          <p className="text-sm text-muted-foreground">
            {status === "on" && "This browser receives HG's alerts as notifications."}
            {status === "off" && "Turn on to receive alerts in this browser, even when the site is closed."}
            {status === "denied" && "Blocked in your browser's site settings. Allow notifications there, then reload."}
            {status === "unsupported" &&
              "This browser does not support web notifications. Try Chrome, Edge, Firefox or Safari."}
            {status === "ios-install" && "On iPhone and iPad, add this site to your Home Screen first."}
          </p>
        </div>
        <Switch
          id="push-switch"
          checked={status === "on"}
          disabled={pending || status === "denied" || status === "unsupported" || status === "ios-install"}
          onCheckedChange={toggle}
        />
      </div>
      {status === "ios-install" && <IosInstallSteps />}
      {status === "on" && (
        <div>
          <Button variant="outline" size="sm" onClick={test} disabled={pending}>
            {pending ? <Spinner /> : <LuBellRing />}
            Send me a test
          </Button>
        </div>
      )}
      {status === "denied" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LuBellOff className="size-4" /> Alerts still appear in the app and by email if you turned email on.
        </p>
      )}
    </div>
  )
}
