import type { Metadata } from "next"
import { answersQuestions } from "@/core/levels"
import { requireActiveMember } from "@/lib/auth/guards"
import { listThreadsFor, readThreadReads } from "@/lib/data/chat"
import { AskQuestion } from "@/components/portal/chat/ask-question"
import { ChatList } from "@/components/portal/chat/chat-list"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Chat" }

/** The question list stays put while members move between conversations. */
export default async function ChatLayout({ children }: LayoutProps<"/members/chat">) {
  const viewer = await requireActiveMember("/members/chat")
  const [threads, reads] = await Promise.all([listThreadsFor(viewer), readThreadReads(viewer.uid)])
  const staff = answersQuestions(viewer.member)
  return (
    <>
      <PageHeader
        title="Chat"
        description={
          staff
            ? "Questions from the class. Answer them here; the asker gets a notification."
            : "Ask about the class, the tools or a trade. Advanced traders and HG's team answer."
        }
        actions={<AskQuestion />}
      />
      <div className="grid overflow-hidden rounded-xl border bg-card md:h-[calc(100svh-15rem)] md:min-h-[28rem] md:grid-cols-[20rem_minmax(0,1fr)]">
        <ChatList
          viewer={{ uid: viewer.uid, staff, isAdmin: viewer.role === "admin" }}
          threads={threads}
          reads={reads}
        />
        {children}
      </div>
    </>
  )
}
