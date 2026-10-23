import { notFound } from "next/navigation"
import { answersQuestions } from "@/core/levels"
import { requireActiveMember } from "@/lib/auth/guards"
import { getThreadFor, readThreadReads } from "@/lib/data/chat"
import { ThreadView } from "@/components/portal/chat/thread-view"

export default async function ChatThreadPage({ params }: PageProps<"/members/chat/[id]">) {
  const { id } = await params
  const viewer = await requireActiveMember(`/members/chat/${id}`)
  const [found, reads] = await Promise.all([getThreadFor(viewer, id), readThreadReads(viewer.uid)])
  if (!found) notFound()
  return (
    <ThreadView
      key={id}
      viewer={{ uid: viewer.uid, staff: answersQuestions(viewer.member), isAdmin: viewer.role === "admin" }}
      thread={found.thread}
      messages={found.messages}
      readAt={reads[id] ?? 0}
    />
  )
}
