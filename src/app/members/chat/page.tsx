import { LuMessagesSquare } from "react-icons/lu"
import { requireActiveMember } from "@/lib/auth/guards"

export default async function ChatPage() {
  await requireActiveMember("/members/chat")
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground md:flex">
      <LuMessagesSquare className="size-7" aria-hidden="true" />
      Pick a question to read the answers, or ask your own.
    </div>
  )
}
