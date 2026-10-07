"use client"

import { useMemo, useState } from "react"
import { LuSearch } from "react-icons/lu"
import type { FaqDoc } from "@/server/model"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { FaqAccordion } from "./faq-accordion"

export function FaqSearch({ faqs, groups }: { faqs: FaqDoc[]; groups: string[] }) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return faqs
    return faqs.filter((f) => [f.question, f.subtitle ?? "", ...f.answer].join(" ").toLowerCase().includes(q))
  }, [faqs, query])

  return (
    <div className="flex flex-col gap-10">
      <InputGroup className="h-11">
        <InputGroupAddon>
          <LuSearch />
        </InputGroupAddon>
        <InputGroupInput type="search" placeholder="Search questions" aria-label="Search questions" value={query} onChange={(e) => setQuery(e.target.value)} />
      </InputGroup>
      {filtered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matching questions</EmptyTitle>
            <EmptyDescription>Try a different word, or book a call and ask HG directly.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((group) => {
          const items = filtered.filter((f) => f.group === group)
          if (items.length === 0) return null
          return (
            <section key={group} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{group}</h2>
              <FaqAccordion faqs={items} />
            </section>
          )
        })
      )}
    </div>
  )
}
