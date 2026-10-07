/**
 * Firestore document shapes, validated at the read boundary.
 * Shared by the Next.js server and Cloud Functions, so this file must not import Next.js or a Firebase SDK.
 * Timestamps arrive as SDK Timestamp objects; `timestamp` turns them into Date.
 */
import { z } from "zod"
import { isIsoDate } from "@/core/dates"

export const COLLECTIONS = {
  members: "members",
  invites: "invites",
  tickers: "tickers",
  tickerBars: "tickerBars",
  weeks: "weeks",
  targetUpdates: "targetUpdates",
  alerts: "alerts",
  standing: "standing",
  presentations: "presentations",
  resources: "resources",
  testimonials: "testimonials",
  faqs: "faqs",
  settings: "settings",
  config: "config",
  auditLog: "auditLog",
  jobRuns: "jobRuns",
  snaptradeUsers: "snaptradeUsers",
} as const

export const MEMBER_SUBCOLLECTIONS = {
  periods: "periods",
  sessions: "sessions",
  logins: "logins",
  fcmTokens: "fcmTokens",
  alertReads: "alertReads",
  privateNotes: "privateNotes",
  trades: "trades",
  journalDays: "journalDays",
  connections: "connections",
  accounts: "accounts",
} as const

const timestampLike = z.custom<{ toDate: () => Date }>(
  (v) => typeof v === "object" && v !== null && "toDate" in v && typeof v.toDate === "function",
  "Expected a Firestore Timestamp",
)
export const timestamp = timestampLike.transform((v) => v.toDate())
export const optionalTimestamp = timestamp.nullable().optional().transform((v) => v ?? null)
export const isoDate = z.string().refine(isIsoDate, "Expected YYYY-MM-DD")

// ---- Membership -------------------------------------------------------------------------------

export const roleSchema = z.enum(["admin", "member"])
export const memberStatusSchema = z.enum(["active", "suspended"])

export const notificationPrefsSchema = z.object({
  pushKinds: z.array(z.enum(["buy", "sell", "update", "watch", "info"])).default(["buy", "sell", "update", "watch", "info"]),
  emailKinds: z.array(z.enum(["buy", "sell", "update", "watch", "info"])).default([]),
  mutedSymbols: z.array(z.string()).default([]),
  targetsPublished: z.boolean().default(true),
  membershipReminders: z.boolean().default(true),
})
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>
export const DEFAULT_PREFS: NotificationPrefs = notificationPrefsSchema.parse({})

export const memberSchema = z.object({
  email: z.string(),
  emailLower: z.string(),
  fullName: z.string(),
  phone: z.string().nullable().default(null),
  whatsapp: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  timezone: z.string().default("America/New_York"),
  role: roleSchema,
  status: memberStatusSchema,
  access: z
    .object({ from: timestamp, until: timestamp, fromDate: isoDate, untilExclusiveDate: isoDate })
    .nullable()
    .default(null),
  memberSince: isoDate.nullable().default(null),
  termsAcceptedAt: optionalTimestamp,
  prefs: notificationPrefsSchema.default(DEFAULT_PREFS),
  brokerage: z
    .object({ linked: z.boolean(), status: z.enum(["active", "needs_reauth", "disabled", "none"]), lastSyncedAt: optionalTimestamp })
    .default({ linked: false, status: "none", lastSyncedAt: null }),
  stats: z
    .object({
      qtdReturn: z.number().nullable(),
      ytdReturn: z.number().nullable(),
      monthReturn: z.number().nullable(),
      weekReturn: z.number().nullable(),
      realizedQtd: z.number().nullable(),
      winRateQtd: z.number().nullable(),
      tradesQtd: z.number(),
      followedAlertsPct: z.number().nullable(),
      maxDrawdownQtd: z.number().nullable(),
      portfolioValue: z.number().nullable(),
      computedAt: optionalTimestamp,
    })
    .nullable()
    .default(null),
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
  lastLoginAt: optionalTimestamp,
})
export type Member = z.infer<typeof memberSchema> & { uid: string }

export const periodSchema = z.object({
  start: isoDate,
  end: isoDate,
  kind: z.enum(["quarterly", "custom"]),
  label: z.string(),
  note: z.string().nullable().default(null),
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
})
export type PeriodDoc = z.infer<typeof periodSchema> & { id: string }

export const invitePeriodSchema = z.object({
  start: isoDate,
  end: isoDate,
  kind: z.enum(["quarterly", "custom"]),
  label: z.string(),
  note: z.string().nullable().default(null),
})

export const inviteSchema = z.object({
  email: z.string(),
  fullName: z.string(),
  role: roleSchema,
  phone: z.string().nullable().default(null),
  whatsapp: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  timezone: z.string().default("America/New_York"),
  notes: z.string().nullable().default(null),
  periods: z.array(invitePeriodSchema).default([]),
  tokenHash: z.string(),
  status: z.enum(["pending", "accepted", "revoked"]),
  expiresAt: timestamp,
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
  acceptedUid: z.string().nullable().default(null),
  acceptedAt: optionalTimestamp,
})
export type Invite = z.infer<typeof inviteSchema> & { id: string }

export const sessionSchema = z.object({
  createdAt: timestamp,
  lastSeenAt: timestamp,
  expiresAt: timestamp,
  userAgent: z.string().nullable().default(null),
  ip: z.string().nullable().default(null),
})
export type SessionDoc = z.infer<typeof sessionSchema> & { id: string }

// ---- Market data and tools --------------------------------------------------------------------

export const tickerSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable().default(null),
  kind: z.enum(["stock", "etf", "index"]).default("stock"),
  active: z.boolean().default(true),
  channelSize: z.number().nullable().default(null),
  bocSize: z.number().nullable().default(null),
  fsLevels: z.array(z.number()).default([]),
  ssLevels: z.array(z.number()).default([]),
  earningsStart: isoDate.nullable().default(null),
  earningsEnd: isoDate.nullable().default(null),
  earningsNote: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  categories: z.array(z.string()).default([]),
  metrics: z
    .object({
      asOf: isoDate,
      lastClose: z.number(),
      price: z.number().nullable().default(null),
      high5d: z.number().nullable(),
      low5d: z.number().nullable(),
      high30d: z.number().nullable(),
      low30d: z.number().nullable(),
      high90d: z.number().nullable(),
      low90d: z.number().nullable(),
      source: z.enum(["import", "provider", "manual"]),
    })
    .nullable()
    .default(null),
  updatedAt: optionalTimestamp,
  updatedBy: z.string().nullable().default(null),
})
export type Ticker = z.infer<typeof tickerSchema>

export const weekRowSchema = z.object({
  pfcp: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  range: z.number(),
  svi: z.number(),
})
export const weekSchema = z.object({
  weekStart: isoDate,
  weekEnd: isoDate,
  rows: z.record(z.string(), weekRowSchema),
  indices: z.record(z.string(), weekRowSchema).default({}),
  source: z.enum(["import", "provider", "manual"]),
  computedAt: timestamp,
})
export type WeekDoc = z.infer<typeof weekSchema>

export const targetEntrySchema = z.object({
  group: z.string(),
  position: z.number(),
  symbol: z.string(),
  target: z.number(),
  breakLevel: z.number(),
  putStrike: z.number(),
  expiry: isoDate,
  dowWeight: z.number().nullable(),
  note: z.string().nullable(),
})
export const targetUpdateSchema = z.object({
  effectiveDate: isoDate,
  title: z.string(),
  status: z.enum(["draft", "published"]),
  entries: z.array(targetEntrySchema),
  sourceText: z.string().nullable().default(null),
  changeNote: z.string().nullable().default(null),
  revisionOf: z.string().nullable().default(null),
  publishedAt: optionalTimestamp,
  publishedBy: z.string().nullable().default(null),
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
})
export type TargetUpdate = z.infer<typeof targetUpdateSchema> & { id: string }

export const targetGroupsSchema = z.object({
  groups: z.array(z.object({ slug: z.string(), name: z.string(), shortName: z.string(), description: z.string().nullable(), order: z.number(), aliases: z.array(z.string()).default([]) })),
})
export type TargetGroupConfig = z.infer<typeof targetGroupsSchema>["groups"][number]

export const etfConfigSchema = z.object({
  guidance: z.array(z.string()),
  pairs: z.array(z.object({ underlying: z.string(), etf: z.string(), leverage: z.number().default(2), direction: z.enum(["bull", "bear"]).default("bull"), issuer: z.string().nullable().default(null) })),
})
export type EtfConfig = z.infer<typeof etfConfigSchema>

// ---- Alerts -----------------------------------------------------------------------------------

export const alertKindSchema = z.enum(["buy", "sell", "update", "watch", "info"])
export const alertSchema = z.object({
  kind: alertKindSchema,
  symbol: z.string().nullable(),
  assetType: z.enum(["stock", "option"]).nullable(),
  optionRight: z.enum(["call", "put"]).nullable(),
  strike: z.number().nullable(),
  expiry: isoDate.nullable(),
  buyLow: z.number().nullable(),
  buyHigh: z.number().nullable(),
  sellPoints: z.array(z.number()).default([]),
  stop: z.number().nullable(),
  title: z.string(),
  body: z.string().default(""),
  imagePath: z.string().nullable().default(null),
  parentId: z.string().nullable().default(null),
  targetEntrySymbol: z.string().nullable().default(null),
  status: z.enum(["draft", "scheduled", "published", "closed", "cancelled"]),
  publishAt: optionalTimestamp,
  publishedAt: optionalTimestamp,
  closedAt: optionalTimestamp,
  exits: z.array(z.object({ price: z.number(), portion: z.number(), at: timestamp })).default([]),
  resultPct: z.number().nullable().default(null),
  sendEmail: z.boolean().default(false),
  delivery: z
    .object({ queued: z.number(), sent: z.number(), failed: z.number(), finishedAt: optionalTimestamp })
    .nullable()
    .default(null),
  tookCount: z.number().default(0),
  edited: z.boolean().default(false),
  createdBy: z.string(),
  createdAt: timestamp,
})
export type AlertDoc = z.infer<typeof alertSchema> & { id: string }

// ---- Journal and brokerage ----------------------------------------------------------------------

export const tradeSchema = z.object({
  source: z.enum(["broker", "manual", "csv"]),
  accountId: z.string().nullable().default(null),
  instrumentKey: z.string(),
  symbol: z.string(),
  assetType: z.enum(["stock", "option"]),
  optionRight: z.enum(["call", "put"]).nullable().default(null),
  strike: z.number().nullable().default(null),
  expiry: isoDate.nullable().default(null),
  direction: z.enum(["long", "short"]),
  status: z.enum(["open", "closed"]),
  openedAt: timestamp,
  closedAt: optionalTimestamp,
  quantity: z.number(),
  avgEntry: z.number(),
  avgExit: z.number().nullable().default(null),
  realizedPnl: z.number().nullable().default(null),
  returnPct: z.number().nullable().default(null),
  fees: z.number().default(0),
  alertId: z.string().nullable().default(null),
  setup: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  thesis: z.string().nullable().default(null),
  plan: z.string().nullable().default(null),
  outcome: z.string().nullable().default(null),
  lesson: z.string().nullable().default(null),
  emotions: z.array(z.string()).default([]),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  screenshots: z.array(z.string()).default([]),
  fills: z
    .array(z.object({ id: z.string(), side: z.enum(["buy", "sell"]), quantity: z.number(), price: z.number(), fees: z.number(), executedAt: z.string() }))
    .default([]),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export type TradeDoc = z.infer<typeof tradeSchema> & { id: string }

export const journalDaySchema = z.object({ body: z.string(), mood: z.number().int().min(1).max(5).nullable().default(null), updatedAt: timestamp })

export const connectionSchema = z.object({
  provider: z.literal("snaptrade"),
  providerAuthId: z.string(),
  brokerageName: z.string(),
  status: z.enum(["active", "needs_reauth", "disabled"]),
  isHouse: z.boolean().default(false),
  consentVersion: z.string(),
  consentedAt: timestamp,
  lastSyncedAt: optionalTimestamp,
  createdAt: timestamp,
})
export type ConnectionDoc = z.infer<typeof connectionSchema> & { id: string }

export const accountSchema = z.object({
  connectionId: z.string(),
  providerAccountId: z.string(),
  name: z.string().nullable(),
  numberMask: z.string().nullable(),
  currency: z.string().default("USD"),
  included: z.boolean().default(true),
  isHouse: z.boolean().default(false),
  balance: z.object({ total: z.number().nullable(), cash: z.number().nullable() }).nullable().default(null),
  lastSyncedAt: optionalTimestamp,
})
export type AccountDoc = z.infer<typeof accountSchema> & { id: string }

export const holdingSchema = z.object({
  instrumentKey: z.string(),
  symbol: z.string(),
  assetType: z.enum(["stock", "option"]),
  optionRight: z.enum(["call", "put"]).nullable().default(null),
  strike: z.number().nullable().default(null),
  expiry: isoDate.nullable().default(null),
  quantity: z.number(),
  avgCost: z.number().nullable(),
  lastPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  asOf: timestamp,
})
export type HoldingDoc = z.infer<typeof holdingSchema>

export const snapshotSchema = z.object({ date: isoDate, value: z.number(), cash: z.number().nullable().default(null), netFlow: z.number().default(0) })

// ---- Standing ---------------------------------------------------------------------------------

const returnsBlock = z.object({ week: z.number().nullable(), month: z.number().nullable(), qtd: z.number().nullable(), ytd: z.number().nullable(), all: z.number().nullable() })
export const standingSchema = z.object({
  computedAt: timestamp,
  hgPortfolio: z
    .object({
      returns: returnsBlock,
      curve: z.array(z.object({ date: isoDate, index: z.number() })),
      value: z.number().nullable(),
      positions: z.array(z.object({ instrumentKey: z.string(), symbol: z.string(), quantity: z.number(), marketValue: z.number().nullable(), weight: z.number().nullable() })).nullable(),
      closedTrades: z.array(z.object({ instrumentKey: z.string(), closedAt: z.string(), returnPct: z.number().nullable(), realizedPnl: z.number().nullable() })).nullable(),
    })
    .nullable(),
  alertsTrackRecord: z.object({
    closed: z.number(),
    wins: z.number(),
    winRate: z.number().nullable(),
    averageReturn: z.number().nullable(),
    medianReturn: z.number().nullable(),
    byMonth: z.array(z.object({ month: z.string(), closed: z.number(), averageReturn: z.number().nullable() })),
  }),
  community: z
    .object({ members: z.number(), pctGreen: z.number(), medianReturn: z.number(), averageReturn: z.number(), averageWinRate: z.number().nullable(), totalTrades: z.number() })
    .nullable(),
})
export type StandingDoc = z.infer<typeof standingSchema>

// ---- Content ----------------------------------------------------------------------------------

export const presentationSchema = z.object({
  title: z.string(),
  sessionDate: isoDate,
  summary: z.string().nullable().default(null),
  slidesPath: z.string().nullable().default(null),
  videoUrl: z.string().nullable().default(null),
  published: z.boolean(),
  createdAt: timestamp,
})
export type PresentationDoc = z.infer<typeof presentationSchema> & { id: string }

export const resourceSchema = z.object({
  folder: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  storagePath: z.string(),
  mimeType: z.string().nullable().default(null),
  sizeBytes: z.number().nullable().default(null),
  published: z.boolean(),
  createdAt: timestamp,
})
export type ResourceDoc = z.infer<typeof resourceSchema> & { id: string }

export const testimonialSchema = z.object({
  name: z.string(),
  location: z.string(),
  avatar: z.string().nullable().default(null),
  flag: z.string().nullable().default(null),
  quote: z.string(),
  trade: z
    .object({
      symbol: z.string(),
      type: z.enum(["call", "put"]),
      strike: z.number(),
      expiryLabel: z.string(),
      realizedProfit: z.number(),
      currency: z.string().default("USD"),
      percentGain: z.number(),
    })
    .nullable()
    .default(null),
  published: z.boolean(),
  order: z.number(),
})
export type TestimonialDoc = z.infer<typeof testimonialSchema> & { id: string }

export const faqSchema = z.object({
  group: z.string(),
  question: z.string(),
  subtitle: z.string().nullable().default(null),
  answer: z.array(z.string()),
  published: z.boolean(),
  order: z.number(),
})
export type FaqDoc = z.infer<typeof faqSchema> & { id: string }

export const siteSettingsSchema = z.object({
  bookingUrl: z.url(),
  instagramUrl: z.url().nullable().default(null),
  youtubeUrl: z.url().nullable().default(null),
  xUrl: z.url().nullable().default(null),
  classSchedule: z
    .array(z.object({ day: z.number().int().min(0).max(6), start: z.string(), end: z.string(), title: z.string(), audience: z.string() }))
    .default([]),
})
export type SiteSettings = z.infer<typeof siteSettingsSchema>

export const memberSettingsSchema = z.object({
  zoomUrl: z.url().nullable().default(null),
  whatsappUrl: z.url().nullable().default(null),
  oneOnOneUrl: z.url().nullable().default(null),
  setupTags: z.array(z.string()).default(["Channel break", "BOC bounce", "Median reclaim", "Earnings play", "Other"]),
  expiringSoonDays: z.number().int().min(1).max(60).default(14),
  sessionLimit: z.number().int().min(1).max(10).default(2),
  hgPortfolio: z
    .object({ showDollars: z.boolean(), showPositions: z.boolean(), showClosedTrades: z.boolean(), positionDelayHours: z.number().int().min(0).max(168) })
    .default({ showDollars: false, showPositions: false, showClosedTrades: true, positionDelayHours: 0 }),
})
export type MemberSettings = z.infer<typeof memberSettingsSchema>

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  bookingUrl: "https://scheduler.zoom.us/hubert-gaffney/welcome-to-your-meeting-to-join-our-profit-options-team",
  instagramUrl: "https://www.instagram.com/hgprofitoptions",
  youtubeUrl: "https://www.youtube.com/@hgprofitoptions",
  xUrl: "https://x.com/hgprofitoptions",
  classSchedule: [
    { day: 6, start: "18:00", end: "19:00", title: "Beginner session", audience: "Mandatory for beginners" },
    { day: 6, start: "19:00", end: "20:30", title: "All traders", audience: "Everyone" },
  ],
}

export const auditSchema = z.object({
  actorUid: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable().default(null),
  createdAt: timestamp,
})
export type AuditEntry = z.infer<typeof auditSchema> & { id: string }

/** Parses a document, attaching its id; returns null (and logs) when the data does not match. */
export function parseDoc<S extends z.ZodType>(schema: S, id: string, data: unknown): (z.output<S> & { id: string }) | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.error(`Invalid document ${id}:`, z.prettifyError(result.error))
    return null
  }
  return { ...(result.data as object), id } as z.output<S> & { id: string }
}
