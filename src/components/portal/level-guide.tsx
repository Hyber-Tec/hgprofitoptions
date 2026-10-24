import { LEVEL_GUIDE, LEVEL_LABELS, LEVELS_INTRO, TRADER_LEVELS, type TraderLevel } from "@/core/levels"
import { cn } from "@/lib/utils"
import { ToneBadge } from "./display"

/** The three trader levels with the member's own marked, in the words members and admins both read. */
export function LevelGuide({ level, className }: { level: TraderLevel; className?: string }) {
  const next = LEVEL_GUIDE[level].next
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-sm text-muted-foreground">{LEVELS_INTRO}</p>
      <ol className="flex flex-col gap-2">
        {TRADER_LEVELS.map((l) => (
          <li
            key={l}
            aria-current={l === level ? "step" : undefined}
            className={cn("flex flex-col gap-0.5 rounded-lg border px-3 py-2.5", l === level && "bg-muted/60")}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              {LEVEL_LABELS[l]}
              {l === level && <ToneBadge tone="neutral">You</ToneBadge>}
            </span>
            <span className="text-sm text-muted-foreground">{LEVEL_GUIDE[l].means}</span>
          </li>
        ))}
      </ol>
      {next && (
        <p className="text-sm">
          <span className="font-medium">Next step: </span>
          {next}
        </p>
      )}
    </div>
  )
}
