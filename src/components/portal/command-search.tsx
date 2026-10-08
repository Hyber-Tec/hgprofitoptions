"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { LuBell, LuNotebookPen, LuSearch, LuUserRound } from "react-icons/lu"
import { ALERT_KIND_LABEL } from "@/core/alerts"
import { getSearchIndex, type SearchIndex } from "@/lib/actions/search"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { ADMIN_NAV, MEMBER_NAV } from "./nav"

export function CommandSearch({ isAdmin, hasAccess }: { isAdmin: boolean; hasAccess: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [loading, startLoading] = useTransition()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open || index) return
    startLoading(async () => {
      setIndex(await getSearchIndex())
    })
  }, [open, index])

  const go = (href: Parameters<typeof router.push>[0]) => {
    setOpen(false)
    router.push(href)
  }

  const pages = [
    ...MEMBER_NAV.flatMap((g) => g.items).filter((i) =>
      hasAccess ? i.href !== "/members/inactive" : i.inactive === true,
    ),
    ...(isAdmin ? ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, title: `Admin · ${i.title}` }))) : []),
  ]

  return (
    <>
      <Button
        variant="outline"
        className="h-8 w-8 justify-start gap-2 px-0 text-muted-foreground max-sm:justify-center sm:w-56 sm:px-2.5"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <LuSearch />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search...</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search tickers, alerts, trades and pages"
      >
        <Command>
          <CommandInput placeholder="Search tickers, alerts, trades..." />
          <CommandList>
            <CommandEmpty>{loading ? <Spinner className="mx-auto" /> : "No results."}</CommandEmpty>
            {index && index.tickers.length > 0 && (
              <CommandGroup heading="Tickers">
                {index.tickers.map((t) => (
                  <CommandItem
                    key={t.symbol}
                    value={`ticker ${t.symbol} ${t.name ?? ""}`}
                    onSelect={() => go(`/members/stocks/${t.symbol}`)}
                  >
                    <span className="w-14 font-mono font-medium">{t.symbol}</span>
                    {t.name && <span className="truncate text-muted-foreground">{t.name}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {index && index.alerts.length > 0 && (
              <CommandGroup heading="Alerts">
                {index.alerts.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`alert ${a.id} ${a.kind} ${a.title}`}
                    onSelect={() => go(`/members/alerts/${a.id}`)}
                  >
                    <LuBell />
                    <span className="truncate">{a.title}</span>
                    <CommandShortcut>{ALERT_KIND_LABEL[a.kind]}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {index && index.trades.length > 0 && (
              <CommandGroup heading="My trades">
                {index.trades.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`trade ${t.id} ${t.label}`}
                    onSelect={() => go(`/members/journal/${t.id}`)}
                  >
                    <LuNotebookPen />
                    <span className="truncate font-mono text-[13px]">{t.label}</span>
                    <CommandShortcut>{t.status === "open" ? "Open" : "Closed"}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {index && index.members.length > 0 && (
              <CommandGroup heading="Members">
                {index.members.map((m) => (
                  <CommandItem
                    key={m.uid}
                    value={`member ${m.fullName} ${m.email}`}
                    onSelect={() => go(`/admin/members/${m.uid}`)}
                  >
                    <LuUserRound />
                    <span className="truncate">{m.fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Pages">
              {pages.map((p) => (
                <CommandItem key={p.href} value={`page ${p.title}`} onSelect={() => go(p.href)}>
                  <p.icon />
                  {p.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
