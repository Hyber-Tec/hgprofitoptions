import type { Route } from "next"
import type { IconType } from "react-icons"
import {
  LuBell,
  LuBellRing,
  LuBriefcase,
  LuChartCandlestick,
  LuChartLine,
  LuCircleHelp,
  LuCrosshair,
  LuDatabase,
  LuFolder,
  LuGraduationCap,
  LuLayers,
  LuLayoutDashboard,
  LuListOrdered,
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
  LuWallet,
} from "react-icons/lu"

export interface NavItem {
  title: string
  href: Route
  icon: IconType
  /** Shows the unread alerts count. */
  badge?: "unread"
  /** Visible to members without an active quarter (their own data stays readable). */
  inactive?: boolean
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
    ],
  },
  {
    label: "Publishing",
    items: [
      { title: "Alerts", href: "/admin/alerts", icon: LuBellRing },
      { title: "Strike targets", href: "/admin/targets", icon: LuCrosshair },
      { title: "HG portfolio", href: "/admin/hg-portfolio", icon: LuBriefcase },
    ],
  },
  {
    label: "Market data",
    items: [
      { title: "Tickers", href: "/admin/tickers", icon: LuListOrdered },
      { title: "Market data", href: "/admin/market-data", icon: LuDatabase },
      { title: "Leveraged ETFs", href: "/admin/etfs", icon: LuLayers },
    ],
  },
  {
    label: "Content",
    items: [
      { title: "Presentations", href: "/admin/presentations", icon: LuPresentation },
      { title: "Files", href: "/admin/files", icon: LuFolder },
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

/** Breadcrumb labels for static path segments. */
export const SEGMENT_LABELS: Record<string, string> = {
  members: "Member area",
  admin: "Admin",
  alerts: "Alerts",
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
