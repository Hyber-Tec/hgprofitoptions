"use client"

import { useMemo, useState, useTransition } from "react"
import { LuSearch, LuUserPlus, LuX } from "react-icons/lu"
import { LEVEL_LABELS, type TraderLevel } from "@/core/levels"
import { assignTest, cancelAssignment } from "@/lib/actions/admin/quizzes"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

export interface AssignableMember {
  uid: string
  fullName: string
  email: string
  level: TraderLevel
  /** Already has this test waiting or in progress. */
  waiting: boolean
}

/** Picks members to take the test. Beginners come first; members with the test waiting are left out. */
export function AssignTestForm({ quizId, members }: { quizId: string; members: AssignableMember[] }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members
      .filter((m) => !m.waiting && (!q || `${m.fullName} ${m.email}`.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          Number(a.level !== "beginner") - Number(b.level !== "beginner") || a.fullName.localeCompare(b.fullName),
      )
  }, [members, query])
  const toggle = (uid: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(uid)
      else next.delete(uid)
      return next
    })
  const assign = () =>
    startTransition(async () => {
      const result = await assignTest(quizId, [...selected])
      if (!result.ok) {
        toast.add({ title: "Not assigned", description: result.message, type: "error" })
        return
      }
      toast.add({
        title: `Assigned to ${result.data.assigned} ${result.data.assigned === 1 ? "member" : "members"}`,
        description: "They see it under Quizzes.",
        type: "success",
      })
      setSelected(new Set())
    })

  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="h-9">
        <InputGroupAddon>
          <LuSearch />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a member"
          aria-label="Find a member"
        />
      </InputGroup>
      <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border">
        {shown.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No members to assign.</li>
        ) : (
          shown.map((m) => (
            <li key={m.uid}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40">
                <Checkbox checked={selected.has(m.uid)} onCheckedChange={(v) => toggle(m.uid, v)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{LEVEL_LABELS[m.level]}</span>
              </label>
            </li>
          ))
        )}
      </ul>
      <div>
        <Button size="sm" onClick={assign} disabled={pending || selected.size === 0}>
          {pending ? <Spinner /> : <LuUserPlus />}
          Assign to {selected.size === 0 ? "members" : `${selected.size} ${selected.size === 1 ? "member" : "members"}`}
        </Button>
      </div>
    </div>
  )
}

export function CancelAssignmentButton({ assignmentId, name }: { assignmentId: string; name: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Cancel ${name}'s test`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelAssignment(assignmentId)
          if (!result.ok) toast.add({ title: "Not cancelled", description: result.message, type: "error" })
        })
      }
    >
      {pending ? <Spinner /> : <LuX />}
    </Button>
  )
}
