"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { LuArrowLeft, LuEllipsis, LuLock, LuSendHorizontal, LuTrash2 } from "react-icons/lu"
import { isUnread, type ChatMessage, type ChatThread } from "@/core/chat"
import { formatDateTimeET, formatTimeET } from "@/core/format"
import { personBadge } from "@/core/levels"
import { deleteThread, markThreadRead, removeMessage, replyToThread } from "@/lib/actions/chat"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "../display"
import type { ChatViewer } from "./chat-list"

const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
})

/** Same calendar day in New York. */
function sameDay(a: number, b: number) {
  return DAY.format(new Date(a)) === DAY.format(new Date(b))
}

function Message({
  message,
  mine,
  isAsker,
  canRemove,
  onRemove,
}: {
  message: ChatMessage
  mine: boolean
  isAsker: boolean
  canRemove: boolean
  onRemove: () => void
}) {
  const badge = personBadge({ role: message.authorRole, level: message.authorLevel })
  const helper = !isAsker && (message.authorRole === "admin" || message.authorLevel === "advanced")
  return (
    <li className={cn("group flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")}>
      <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        {!mine && <span className="font-medium text-foreground">{message.authorName}</span>}
        <ToneBadge tone={helper ? "positive" : "muted"}>{badge}</ToneBadge>
        <time
          dateTime={new Date(message.createdAt).toISOString()}
          title={formatDateTimeET(new Date(message.createdAt))}
        >
          {formatTimeET(new Date(message.createdAt))}
        </time>
        {canRemove && !message.removed && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Remove this message"
          >
            <LuTrash2 className="size-3.5" />
          </button>
        )}
      </span>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
          message.removed
            ? "border border-dashed text-muted-foreground italic"
            : mine
              ? "rounded-br-md bg-primary text-primary-foreground"
              : helper
                ? "rounded-bl-md border border-positive/30 bg-positive/8"
                : "rounded-bl-md bg-muted",
        )}
      >
        {message.removed ? "Removed by an admin" : message.body}
      </div>
    </li>
  )
}

/**
 * One question and its answers. The asker, advanced traders and admins can reply; everyone else reads along.
 * Messages arrive live; until the listener connects, the server-rendered messages show.
 */
export function ThreadView({
  viewer,
  thread: initialThread,
  messages: initialMessages,
  readAt,
}: {
  viewer: ChatViewer
  thread: ChatThread
  messages: ChatMessage[]
  /** When this member last opened the thread (epoch ms). */
  readAt: number
}) {
  const router = useRouter()
  const [live, setLive] = useState<{ thread: ChatThread | null | undefined; messages: ChatMessage[] | null }>({
    thread: undefined,
    messages: null,
  })
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const endRef = useRef<HTMLLIElement>(null)
  const markedAt = useRef(0)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    void import("./chat-listener").then(({ listenToThread }) => {
      if (cancelled) return
      stop = listenToThread(viewer.uid, initialThread.id, {
        onThread: (thread) => setLive((s) => ({ ...s, thread })),
        onMessages: (messages) => setLive((s) => ({ ...s, messages })),
        onIdle: () => setLive({ thread: undefined, messages: null }),
      })
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [viewer.uid, initialThread.id])

  const thread = live.thread ?? initialThread
  const messages = live.messages ?? initialMessages
  const deleted = live.thread === null
  const isAsker = thread.askerUid === viewer.uid
  const canReply = isAsker || viewer.staff

  // Opening the thread marks it read, once per new message.
  useEffect(() => {
    if (deleted || !isUnread(thread, viewer.uid, { [thread.id]: Math.max(readAt, markedAt.current) })) return
    markedAt.current = thread.lastMessageAt
    void markThreadRead(thread.id)
  }, [thread, viewer.uid, readAt, deleted])

  // Keep the newest message in view.
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  const send = () => {
    const body = text.trim()
    if (!body || pending) return
    startTransition(async () => {
      const result = await replyToThread(thread.id, body)
      if (!result.ok) {
        toast.add({ title: "Not sent", description: result.message, type: "error" })
        return
      }
      setText("")
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on a keyboard; Shift+Enter (and Enter on touch screens) starts a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      if (window.matchMedia("(pointer: coarse)").matches) return
      event.preventDefault()
      send()
    }
  }

  const remove = (messageId: string) =>
    startTransition(async () => {
      const result = await removeMessage(thread.id, messageId)
      if (!result.ok) toast.add({ title: "Not removed", description: result.message, type: "error" })
    })

  const removeThread = () =>
    startTransition(async () => {
      const result = await deleteThread(thread.id)
      if (!result.ok) {
        toast.add({ title: "Not deleted", description: result.message, type: "error" })
        return
      }
      toast.add({ title: "Thread deleted", type: "success" })
      router.push("/members/chat")
    })

  if (deleted)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
        This conversation was deleted.
        <Link href="/members/chat" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to all questions
        </Link>
      </div>
    )

  return (
    <section aria-label={thread.title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <Link
          href="/members/chat"
          className="-ml-1 rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
          aria-label="All questions"
        >
          <LuArrowLeft className="size-5" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base leading-snug font-semibold break-words">{thread.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>Asked by {isAsker ? "you" : thread.askerName}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTimeET(new Date(thread.createdAt))}</span>
            {thread.visibility === "staff" && (
              <span className="inline-flex items-center gap-1">
                <LuLock className="size-3" aria-hidden="true" />
                Only advanced traders and admins see it
              </span>
            )}
            <ToneBadge tone={thread.status === "answered" ? "positive" : "muted"}>
              {thread.status === "answered" ? "Answered" : "Waiting for an answer"}
            </ToneBadge>
          </p>
        </div>
        {viewer.isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Thread actions" />}>
              <LuEllipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={removeThread}>
                <LuTrash2 />
                Delete thread
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <ol className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5" aria-label="Messages">
        {messages.map((m, i) => {
          const previous = messages[i - 1]
          return (
            <Fragment key={m.id}>
              {(!previous || !sameDay(previous.createdAt, m.createdAt)) && (
                <li className="self-center text-xs text-muted-foreground">{DAY.format(new Date(m.createdAt))}</li>
              )}
              <Message
                message={m}
                mine={m.authorUid === viewer.uid}
                isAsker={m.authorUid === thread.askerUid}
                canRemove={viewer.isAdmin}
                onRemove={() => remove(m.id)}
              />
            </Fragment>
          )
        })}
        <li ref={endRef} aria-hidden="true" className="h-px" />
      </ol>

      {canReply ? (
        <form
          className="sticky bottom-0 flex items-end gap-2 border-t bg-background p-3 md:static"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={4000}
            placeholder={isAsker ? "Add more detail or a follow-up" : "Write an answer"}
            aria-label={isAsker ? "Your message" : "Your answer"}
            className="max-h-40 min-h-10 resize-none"
          />
          <Button type="submit" size="icon" disabled={pending || text.trim() === ""} aria-label="Send">
            {pending ? <Spinner /> : <LuSendHorizontal />}
          </Button>
        </form>
      ) : (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          The person who asked, advanced traders and admins reply here. Ask your own question with Ask a question.
        </p>
      )}
    </section>
  )
}
