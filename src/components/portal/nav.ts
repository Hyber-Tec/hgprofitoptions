import type { Route } from "next"
import type { IconType } from "react-icons"
import type { Role } from "@/core/domain/types"
import {
  LuActivity,
  LuBell,
  LuBellRing,
  LuBriefcase,
  LuChartCandlestick,
  LuChartLine,
  LuCircleHelp,
  LuClipboardCheck,
  LuCrosshair,
  LuDatabase,
  LuFolder,
  LuGraduationCap,
  LuLayers,
  LuLayoutDashboard,
  LuListOrdered,
  LuMessagesSquare,
  LuNewspaper,
  LuNotebookPen,
  LuPresentation,
  LuQuote,
  LuScrollText,
  LuSettings,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuTable2,
  LuTrophy,
  LuUserRound,
  LuUsers,
  LuVideo,
  LuWallet,
} from "react-icons/lu"

export interface NavItem {
  title: string
  href: Route
  icon: IconType
  /**
   * Shows the unread alerts count, the chat count (waiting questions, or new answers to mine) or the
   * number of tests waiting for this member.
   */
  badge?: "unread" | "chat" | "tests"
  /** Visible to members without an active quarter (their own data stays readable). */
  inactive?: boolean
  /** Admin pages that data editors use too (the market data and the tools). */
  editor?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const MEMBER_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/members", icon: LuLayoutDashboard },
      { title: "Membership", href: "/members/inactive", icon: LuUserRound, inactive: true },
      { title: "Alerts", href: "/members/alerts", icon: LuBell, badge: "unread" },
      { title: "Chat", href: "/members/chat", icon: LuMessagesSquare, badge: "chat" },
    ],
  },
  {
    label: "My trading",
    items: [
      { title: "Portfolio", href: "/members/portfolio", icon: LuWallet, inactive: true },
      { title: "Journal", href: "/members/journal", icon: LuNotebookPen, inactive: true },
    ],
  },
  { label: "HG", items: [{ title: "HG standing", href: "/members/standing", icon: LuTrophy }] },
  {
    label: "Tools",
    items: [
      { title: "Strike Price Targets", href: "/members/targets", icon: LuCrosshair },
      { title: "Median & Channel Chart", href: "/members/channels", icon: LuChartCandlestick },
      { title: "Key Market Data", href: "/members/market-data", icon: LuTable2 },
      { title: "Leveraged ETFs", href: "/members/etfs", icon: LuLayers },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "Presentations", href: "/members/presentations", icon: LuPresentation },
      { title: "Files", href: "/members/files", icon: LuFolder },
      { title: "Quizzes", href: "/members/quizzes", icon: LuClipboardCheck, badge: "tests" },
      { title: "Classroom", href: "/members/classroom", icon: LuGraduationCap },
    ],
  },
  { label: "Account", items: [{ title: "Settings", href: "/members/settings", icon: LuSettings, inactive: true }] },
]

export const ADMIN_NAV: NavGroup[] = [
  { label: "Overview", items: [{ title: "Overview", href: "/admin", icon: LuLayoutDashboard }] },
  {
    label: "Members",
    items: [
      { title: "Members", href: "/admin/members", icon: LuUsers },
      { title: "Performance", href: "/admin/performance", icon: LuChartLine },
      { title: "Chat", href: "/members/chat", icon: LuMessagesSquare, badge: "chat" },
    ],
  },
  {
    label: "Publishing",
    items: [
      { title: "Alerts", href: "/admin/alerts", icon: LuBellRing },
      { title: "Market brief", href: "/admin/briefs", icon: LuNewspaper, editor: true },
      { title: "Spikes", href: "/admin/spikes", icon: LuActivity, editor: true },
      { title: "Strike targets", href: "/admin/targets", icon: LuCrosshair, editor: true },
      { title: "HG portfolio", href: "/admin/hg-portfolio", icon: LuBriefcase },
    ],
  },
  {
    label: "Market data",
    items: [
      { title: "Tickers", href: "/admin/tickers", icon: LuListOrdered, editor: true },
      { title: "Market data", href: "/admin/market-data", icon: LuDatabase, editor: true },
      { title: "Leveraged ETFs", href: "/admin/etfs", icon: LuLayers, editor: true },
    ],
  },
  {
    label: "Content",
    items: [
      { title: "Presentations", href: "/admin/presentations", icon: LuPresentation },
      { title: "Files", href: "/admin/files", icon: LuFolder },
      { title: "Quizzes", href: "/admin/quizzes", icon: LuClipboardCheck },
      { title: "Class recaps", href: "/admin/recaps", icon: LuVideo },
      { title: "Testimonials", href: "/admin/testimonials", icon: LuQuote },
      { title: "FAQ", href: "/admin/faq", icon: LuCircleHelp },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Settings", href: "/admin/settings", icon: LuSlidersHorizontal },
      { title: "Audit log", href: "/admin/audit", icon: LuScrollText },
      { title: "Security", href: "/admin/security", icon: LuShieldCheck },
    ],
  },
]

/** The admin console as a role sees it: everything for admins, the market data and tools for data editors. */
export function adminNavFor(role: Role): NavGroup[] {
  if (role === "admin") return ADMIN_NAV
  if (role === "member") return []
  return ADMIN_NAV.map((group) => ({ ...group, items: group.items.filter((item) => item.editor === true) })).filter(
    (group) => group.items.length > 0,
  )
}

/** Breadcrumb labels for static path segments. */
export const SEGMENT_LABELS: Record<string, string> = {
  members: "Member area",
  admin: "Admin",
  alerts: "Alerts",
  brief: "Market brief",
  briefs: "Market brief",
  spikes: "Spikes",
  chat: "Chat",
  portfolio: "Portfolio",
  journal: "Journal",
  standing: "HG standing",
  targets: "Strike Price Targets",
  channels: "Median & Channel Chart",
  "market-data": "Key Market Data",
  etfs: "Leveraged ETFs",
  stocks: "Stocks",
  presentations: "Presentations",
  files: "Files",
  classroom: "Classroom",
  recaps: "Class recaps",
  live: "Live class",
  quizzes: "Quizzes",
  settings: "Settings",
  notifications: "Notifications",
  brokerages: "Brokerages",
  sessions: "Sessions",
  inactive: "Membership",
  performance: "Performance",
  "hg-portfolio": "HG portfolio",
  tickers: "Tickers",
  testimonials: "Testimonials",
  faq: "FAQ",
  audit: "Audit log",
  security: "Security",
  new: "New",
  import: "Import",
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/members" || href === "/admin") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
