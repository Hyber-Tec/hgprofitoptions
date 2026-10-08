import { PageSkeleton } from "@/components/portal/page-skeleton"
import { SettingsNav } from "@/components/portal/settings/settings-nav"

export default function Loading() {
  return <PageSkeleton title="Settings" nav={<SettingsNav />} />
}
