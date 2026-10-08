"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { LuLink2, LuRefreshCw } from "react-icons/lu"
import { refreshBrokerage, setAccountIncluded, startBrokerageConnection } from "@/lib/actions/brokerage"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"

export const CONSENT_COPY =
  "Your linked accounts' positions, trades and performance will be visible to HG Profit Options admins for coaching. We never place trades. You can disconnect at any time."

/** Opens the SnapTrade Connection Portal after the member agrees to the consent text. */
export function ConnectBrokerage({
  available,
  reconnectId,
  label = "Connect your brokerage",
}: {
  available: boolean
  reconnectId?: string
  label?: string
}) {
  const [consent, setConsent] = useState(Boolean(reconnectId))
  const [pending, startTransition] = useTransition()
  const connect = () =>
    startTransition(async () => {
      const result = await startBrokerageConnection({ consent, ...(reconnectId ? { reconnectId } : {}) })
      if (!result.ok) {
        toast.add({ title: "Could not open the brokerage portal", description: result.message, type: "error" })
        return
      }
      const wide = window.matchMedia("(min-width: 768px)").matches
      const popup = wide ? window.open(result.data.url, "snaptrade", "width=520,height=760") : null
      if (!popup) window.location.href = result.data.url
    })
  return (
    <div className="flex flex-col gap-4">
      {!reconnectId && (
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v)} className="mt-0.5" disabled={!available} />
          <span>{CONSENT_COPY}</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={connect} disabled={!available || !consent || pending}>
          {pending ? <Spinner /> : <LuLink2 />}
          {label}
        </Button>
        {!available && <span className="text-sm text-muted-foreground">Brokerage linking is not switched on yet.</span>}
      </div>
    </div>
  )
}

export function RefreshButton({ available }: { available: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!available || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshBrokerage()
          toast.add(
            result.ok
              ? {
                  title: "Synced",
                  description: `${result.data.accounts} account${result.data.accounts === 1 ? "" : "s"} updated.`,
                  type: "success",
                }
              : { title: "Not synced", description: result.message, type: "error" },
          )
        })
      }
    >
      {pending ? <Spinner /> : <LuRefreshCw />}
      Refresh
    </Button>
  )
}

/** After returning from the Connection Portal (?connected=1), run the first sync once. */
export function SyncAfterConnect() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const started = useRef(false)
  useEffect(() => {
    if (params.get("connected") !== "1" || started.current) return
    started.current = true
    void refreshBrokerage().then((result) => {
      toast.add(
        result.ok
          ? { title: "Brokerage linked", description: "Your accounts are synced.", type: "success" }
          : { title: "Linked, sync pending", description: result.message, type: "info" },
      )
      router.replace(pathname, { scroll: false })
    })
  }, [params, router, pathname])
  return null
}

export function IncludeAccountSwitch({ accountId, included }: { accountId: string; included: boolean }) {
  const [value, setValue] = useState(included)
  const [pending, startTransition] = useTransition()
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label="Include in my stats"
      onCheckedChange={(on) =>
        startTransition(async () => {
          setValue(on)
          const result = await setAccountIncluded(accountId, on)
          if (!result.ok) {
            setValue(!on)
            toast.add({ title: "Not updated", description: result.message, type: "error" })
          }
        })
      }
    />
  )
}
