import { briefParts } from "@/core/briefs"
import { cn } from "@/lib/utils"

/**
 * A market brief as written: paragraphs split by blank lines, and lines starting with "- ", "• " or "1."
 * as lists (a paragraph may lead into its list). Plain text in, so whatever is pasted reads cleanly.
 */
export function BriefBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>
      {briefParts(body).map((part, i) =>
        part.kind === "list" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-muted-foreground">
            {part.lines.map((line, j) => (
              <li key={j}>{line}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {part.lines.join("\n")}
          </p>
        ),
      )}
    </div>
  )
}

/** The brief's opening lines as one short paragraph, for the dashboard. */
export function BriefExcerpt({ body, className }: { body: string; className?: string }) {
  const text = briefParts(body)
    .flatMap((part) => part.lines)
    .join(" ")
  return <p className={cn("line-clamp-4 text-sm leading-relaxed", className)}>{text}</p>
}
