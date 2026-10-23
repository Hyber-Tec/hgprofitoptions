import type { LiveQuote } from "@/core/domain/types"
import type { TargetStatus } from "@/core/parsers/strike-targets"
import type { TargetRow } from "@/lib/tools/targets"
import { ToneBadge, type Tone } from "../display"

const STATUS: Record<TargetStatus, { label: string; tone: Tone }> = {
  "above-target": { label: "Above target", tone: "positive" },
  between: { label: "Between", tone: "neutral" },
  "below-break": { label: "Below break", tone: "negative" },
}

export function StatusBadge({ status }: { status: TargetStatus | null }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  return <ToneBadge tone={STATUS[status].tone}>{STATUS[status].label}</ToneBadge>
}

/** A strike target with its latest price: live when market data is connected, else the last close. */
export interface PricedRow extends TargetRow {
  price: number | null
  live: boolean
  /** The market session of the live price. */
  session: LiveQuote["marketStatus"]
  status: TargetStatus | null
}
