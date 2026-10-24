"use client"

import Link from "next/link"
import { useSelectedLayoutSegment } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { LuLock, LuMessageCircleQuestion } from "react-icons/lu"
import { isUnread, type ChatThread } from "@/core/chat"
import { cn } from "@/lib/utils"
import { RelativeTime } from "@/components/shared/relative-time"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ToneBadge } from "../display"

export interface ChatViewer {
  uid: string
  /** Advanced traders and admins: they answer questions and see every thread. */
  staff: boolean
  isAdmin: boolean
}

type Filter = "all" | "waiting" | "mine"

/**
 * The questions this member can read, kept live with Firestore listeners (chat-listener.ts, loaded after
 * the page is interactive). Until they connect, the server-rendered list shows.
 */
export function ChatList({
  viewer,
  threads: initialThreads,
  reads: initialReads,
}: {
  viewer: ChatViewer
  threads: ChatThread[]
  reads: Record<string, number>
}) {
  const selected = useSelectedLayoutSegment()
  const [live, setLive] = useState<{ threads: ChatThread[] | null; reads: Record<string, number> | null }>({
    threads: null,
    reads: null,
  })
  const [filter, setFilter] = useState<Filter>(viewer.staff ? "waiting" : "all")

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    void import("./chat-listener").then(({ listenToThreads }) => {
      if (cancelled) return
      stop = listenToThreads(viewer.uid, viewer.staff, {
        onThreads: (threads) => setLive((s) => ({ ...s, threads })),
        onReads: (reads) => setLive((s) => ({ ...s, reads })),
        onIdle: () => setLive({ threads: null, reads: null }),
      })
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [viewer.uid, viewer.staff])

  const threads = live.threads ?? initialThreads
  const reads = live.reads ?? initialReads
  const shown = useMemo(
    () =>
      threads.filter((t) =>
        filter === "waiting" ? t.status === "open" : filter === "mine" ? t.askerUid === viewer.uid : true,
      ),
    [threads, filter, viewer.uid],
  )
  const waiting = threads.filter((t) => t.status === "open").length

  return (
    <aside aria-label="Questions" className={cn("min-h-0 flex-col md:flex md:border-r", selected ? "hidden" : "flex")}>
      <div className="flex items-center gap-2 border-b p-3">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[filter]}
          onValueChange={(v: string[]) => v[0] && setFilter(v[0] as Filter)}
          aria-label="Show"
        >
          {viewer.staff && (
            <ToggleGroupItem value="waiting">
              Waiting <span className="text-muted-foreground tabular-nums">{waiting}</span>
            </ToggleGroupItem>
          )}
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="mine">Mine</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
          <LuMessageCircleQuestion className="size-6" aria-hidden="true" />
          {filter === "waiting"
            ? "Every question has an answer."
            : filter === "mine"
              ? "You have not asked anything yet."
              : "No questions yet. Ask the first one."}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {shown.map((t) => {
            const unread = isUnread(t, viewer.uid, reads)
            const active = selected === t.id
            return (
              <li key={t.id}>
                <Link
                  href={`/members/chat/${t.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col gap-1.5 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/60",
                    active && "bg-muted hover:bg-muted",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className={cn("line-clamp-2 text-sm", unread ? "font-semibold" : "font-medium")}>
                      {t.title}
                    </span>
                    {unread && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">New reply</span>
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{t.lastMessagePreview}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t.visibility === "staff" && <LuLock className="size-3" aria-label="Private" />}
                    <span className="truncate">{t.askerUid === viewer.uid ? "You" : t.askerName}</span>
                    <span aria-hidden="true">·</span>
                    <RelativeTime iso={new Date(t.lastMessageAt).toISOString()} className="shrink-0" />
                    <ToneBadge tone={t.status === "answered" ? "positive" : "muted"} className="ml-auto">
                      {t.status === "answered" ? "Answered" : "Waiting"}
                    </ToneBadge>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
