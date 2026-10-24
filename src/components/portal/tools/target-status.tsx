import type { LiveQuote } from "@/core/domain/types"
import { TARGET_STATUS_LABELS, type TargetStatus } from "@/core/parsers/strike-targets"
import type { TargetRow } from "@/lib/tools/targets"
import { ToneBadge, type Tone } from "../display"

const TONE: Record<TargetStatus, Tone> = { "above-target": "positive", between: "neutral", "below-break": "negative" }

export function StatusBadge({ status }: { status: TargetStatus | null }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  return <ToneBadge tone={TONE[status]}>{TARGET_STATUS_LABELS[status]}</ToneBadge>
}

/** A strike target with its latest price: live when market data is connected, else the last close. */
export interface PricedRow extends TargetRow {
  price: number | null
  live: boolean
  /** The market session of the live price. */
  session: LiveQuote["marketStatus"]
  status: TargetStatus | null
}
