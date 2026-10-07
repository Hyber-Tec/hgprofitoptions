import type { IconType } from "react-icons"
import { LuArrowDownRight, LuArrowUpRight, LuEye, LuInfo, LuPencil } from "react-icons/lu"
import { ALERT_KIND_LABEL } from "@/core/alerts"
import type { AlertKind } from "@/core/domain/types"
import { ToneBadge, type Tone } from "../display"

export const KIND_META: Record<AlertKind, { icon: IconType; tone: Tone }> = {
  buy: { icon: LuArrowUpRight, tone: "positive" },
  sell: { icon: LuArrowDownRight, tone: "negative" },
  update: { icon: LuPencil, tone: "neutral" },
  watch: { icon: LuEye, tone: "muted" },
  info: { icon: LuInfo, tone: "neutral" },
}

export function AlertKindBadge({ kind, className }: { kind: AlertKind; className?: string }) {
  const { icon: Icon, tone } = KIND_META[kind]
  return (
    <ToneBadge tone={tone} className={className}>
      <Icon aria-hidden="true" />
      {ALERT_KIND_LABEL[kind]}
    </ToneBadge>
  )
}
