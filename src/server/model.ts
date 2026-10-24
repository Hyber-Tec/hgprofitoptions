/**
 * Firestore document shapes, validated at the read boundary.
 * Shared by the Next.js server and Cloud Functions, so this file must not import Next.js or a Firebase SDK.
 * Timestamps arrive as SDK Timestamp objects; `timestamp` turns them into Date.
 */
import { z } from "zod"
import { isIsoDate } from "@/core/dates"
import { EARNINGS_TIMINGS } from "@/core/earnings"
import { TRADER_LEVELS } from "@/core/levels"
import { CLASS_AUDIENCES } from "@/core/schedule"

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
  threads: "threads",
  quizzes: "quizzes",
  quizAttempts: "quizAttempts",
  quizAssignments: "quizAssignments",
  classRecaps: "classRecaps",
  /** classReminders/{date-time-session}: one per class occurrence, so its reminder goes out once. */
  classReminders: "classReminders",
  /** trialStarts/{hash of network and day}: free trials started, to cap them per network and day. */
  trialStarts: "trialStarts",
  /** briefs/{id}: HG's market briefs (the pre-market view and the updates in the first hour). */
  briefs: "briefs",
  /** briefSlots/{date-time}: one per scheduled time the AI writes the brief, so it is written once. */
  briefSlots: "briefSlots",
  /** spikePosts/{id}: a spike list HG posts (one notification each); spikes/{id}: its stocks. */
  spikePosts: "spikePosts",
  spikes: "spikes",
  invoices: "invoices",
  /** counters/invoices: the last invoice number used each year ({ "2026": 7 }). */
  counters: "counters",
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
  adminNotes: "adminNotes",
  threadReads: "threadReads",
} as const

export const ACCOUNT_SUBCOLLECTIONS = {
  holdings: "holdings",
  snapshots: "snapshots",
  fills: "fills",
} as const

/** Subcollections of alerts/{id} and targetUpdates/{id} that keep earlier published versions. */
export const REVISIONS = "revisions"

/** threads/{id}/messages. */
export const MESSAGES = "messages"

const timestampLike = z.custom<{ toDate: () => Date }>(
  (v) => typeof v === "object" && v !== null && "toDate" in v && typeof v.toDate === "function",
  "Expected a Firestore Timestamp",
)
export const timestamp = timestampLike.transform((v) => v.toDate())
export const optionalTimestamp = timestamp
  .nullable()
  .optional()
  .transform((v) => v ?? null)
export const isoDate = z.string().refine(isIsoDate, "Expected YYYY-MM-DD")

// ---- Membership -------------------------------------------------------------------------------

export const roleSchema = z.enum(["admin", "editor", "member"])
export const memberStatusSchema = z.enum(["active", "suspended"])

export const notificationPrefsSchema = z.object({
  pushKinds: z
    .array(z.enum(["buy", "sell", "update", "watch", "info"]))
    .default(["buy", "sell", "update", "watch", "info"]),
  emailKinds: z.array(z.enum(["buy", "sell", "update", "watch", "info"])).default([]),
  mutedSymbols: z.array(z.string()).default([]),
  targetsPublished: z.boolean().default(true),
  membershipReminders: z.boolean().default(true),
  /** Chat: answers to my questions (advanced traders and admins: new questions). */
  chat: z.boolean().default(true),
  /** The AI recap of a class is ready. */
  classRecaps: z.boolean().default(true),
  /** A reminder with the Zoom link before each class meant for this member. */
  classReminders: z.boolean().default(true),
  /** A new market brief is posted. */
  marketBrief: z.boolean().default(true),
  /** HG posts a spike list. */
  spikes: z.boolean().default(true),
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
  /** Shown on their invoices; several lines. */
  mailingAddress: z.string().nullable().default(null),
  timezone: z.string().default("America/New_York"),
  role: roleSchema,
  status: memberStatusSchema,
  /** Beginner until a passed test or an admin says otherwise. */
  level: z.enum(TRADER_LEVELS).default("beginner"),
  levelSetBy: z.enum(["default", "test", "admin"]).default("default"),
  levelSetAt: optionalTimestamp,
  access: z
    .object({
      from: timestamp,
      until: timestamp,
      fromDate: isoDate,
      untilExclusiveDate: isoDate,
      /** A free trial is all that covers today: HG's newest posts stay hidden (see the security rules). */
      trial: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  memberSince: isoDate.nullable().default(null),
  termsAcceptedAt: optionalTimestamp,
  prefs: notificationPrefsSchema.default(DEFAULT_PREFS),
  /** The sidebar left collapsed on a desktop. Kept here so pages render it that way from the start. */
  sidebarCollapsed: z.boolean().default(false),
  brokerage: z
    .object({
      linked: z.boolean(),
      status: z.enum(["active", "needs_reauth", "disabled", "none"]),
      lastSyncedAt: optionalTimestamp,
    })
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
  /** Set when the member asks HG to delete their account. */
  deletionRequestedAt: optionalTimestamp,
  deletionReason: z.string().nullable().default(null),
  brokerageConsent: z.object({ version: z.string(), text: z.string(), at: timestamp }).nullable().default(null),
})
export type Member = z.infer<typeof memberSchema> & { uid: string }
export type MemberStats = NonNullable<Member["stats"]>

export const periodSchema = z.object({
  start: isoDate,
  end: isoDate,
  kind: z.enum(["quarterly", "custom", "trial"]),
  label: z.string(),
  note: z.string().nullable().default(null),
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
})
export type PeriodDoc = z.infer<typeof periodSchema> & { id: string }

export const invitePeriodSchema = z.object({
  start: isoDate,
  end: isoDate,
  kind: z.enum(["quarterly", "custom", "trial"]),
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
  /** Started by the visitor from the site's free trial page, not sent by HG. */
  trial: z.boolean().default(false),
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
  /** Before the open or after the close, when the day is known. */
  earningsTiming: z.enum(EARNINGS_TIMINGS).nullable().default(null),
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

export const barSchema = z.object({
  date: isoDate,
  open: z.number().nullable(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable(),
})
/** tickerBars/{SYMBOL}: about 18 months of daily bars in one document (one read per chart). */
export const tickerBarsSchema = z.object({
  symbol: z.string(),
  bars: z.array(barSchema),
  /** The execution date of the newest split already reflected in the (split-adjusted) bars. */
  lastSplit: isoDate.nullable().default(null),
  updatedAt: timestamp,
})
export type TickerBars = z.infer<typeof tickerBarsSchema>

export const weekRowSchema = z.object({
  pfcp: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  range: z.number(),
  svi: z.number(),
})
/** An index's week, as HG posts it: also when its high and low happened. */
export const indexWeekRowSchema = weekRowSchema.extend({
  /** ISO instants (the start of the 5-minute bar), when market data provides them. */
  highAt: z.string().nullable().default(null),
  lowAt: z.string().nullable().default(null),
  /** Typed in by an admin: market data never replaces it. */
  entered: z.boolean().default(false),
})
export type IndexWeekRow = z.infer<typeof indexWeekRowSchema>

export const weekSchema = z.object({
  weekStart: isoDate,
  weekEnd: isoDate,
  rows: z.record(z.string(), weekRowSchema),
  indices: z.record(z.string(), indexWeekRowSchema).default({}),
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
  /** 1 for the first publish; corrections increase it and archive the previous version. */
  revision: z.number().int().default(1),
  publishedAt: optionalTimestamp,
  publishedBy: z.string().nullable().default(null),
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
})
export type TargetUpdate = z.infer<typeof targetUpdateSchema> & { id: string }

export const targetGroupsSchema = z.object({
  groups: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      shortName: z.string(),
      description: z.string().nullable(),
      order: z.number(),
      aliases: z.array(z.string()).default([]),
    }),
  ),
})
export type TargetGroupConfig = z.infer<typeof targetGroupsSchema>["groups"][number]

export const etfConfigSchema = z.object({
  guidance: z.array(z.string()),
  pairs: z.array(
    z.object({
      underlying: z.string(),
      etf: z.string(),
      leverage: z.number().default(2),
      direction: z.enum(["bull", "bear"]).default("bull"),
      issuer: z.string().nullable().default(null),
    }),
  ),
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
    .object({
      /** Members with access when it was published. */
      audience: z.number().default(0),
      queued: z.number(),
      sent: z.number(),
      failed: z.number(),
      finishedAt: optionalTimestamp,
    })
    .nullable()
    .default(null),
  /** Who is sending the notifications (an event id), so a trigger that fires twice sends once. */
  deliveryClaim: z.object({ id: z.string(), at: timestamp }).nullable().default(null),
  edited: z.boolean().default(false),
  editedAt: optionalTimestamp,
  revision: z.number().int().default(1),
  createdBy: z.string(),
  createdAt: timestamp,
})
export type AlertDoc = z.infer<typeof alertSchema> & { id: string }

/** members/{uid}/alertReads/{alertId}. Read and "took it" counts are aggregation queries over these. */
export const alertReadSchema = z.object({
  alertId: z.string(),
  /** False for admins, so the counts reflect members. */
  member: z.boolean().default(false),
  readAt: timestamp,
  took: z.boolean().default(false),
  /** Set by "I took this trade" so a later brokerage sync can link the matching trade. */
  tookInstrumentKey: z.string().nullable().default(null),
})

export const fcmTokenSchema = z.object({
  token: z.string(),
  userAgent: z.string().nullable().default(null),
  sessionId: z.string().nullable().default(null),
  createdAt: timestamp,
  lastSeenAt: timestamp,
})
export type FcmTokenDoc = z.infer<typeof fcmTokenSchema> & { id: string }

// ---- Chat ---------------------------------------------------------------------------------------

/** threads/{id}: one question and its answers. Written by the server; members read them live. */
export const threadSchema = z.object({
  askerUid: z.string(),
  askerName: z.string(),
  /** "class": every member with access reads it; "staff": only the asker, advanced traders and admins. */
  visibility: z.enum(["class", "staff"]),
  title: z.string(),
  /** "answered" once an advanced trader or admin replied after the last question from the asker. */
  status: z.enum(["open", "answered"]),
  createdAt: timestamp,
  lastMessageAt: timestamp,
  lastMessageBy: z.string(),
  lastMessagePreview: z.string(),
  messageCount: z.number().int(),
})
export type ThreadDoc = z.infer<typeof threadSchema> & { id: string }

export const threadMessageSchema = z.object({
  authorUid: z.string(),
  authorName: z.string(),
  authorRole: roleSchema,
  authorLevel: z.enum(TRADER_LEVELS),
  body: z.string(),
  createdAt: timestamp,
  /** Set when an admin removes the message; the text is cleared. */
  removed: z.boolean().default(false),
})
export type ThreadMessageDoc = z.infer<typeof threadMessageSchema> & { id: string }

// ---- Market brief -------------------------------------------------------------------------------

/**
 * briefs/{id}: a market brief: the pre-market view or an update in the first hour, posted by an admin
 * (pasted in, often) or written by AI at a scheduled time. Only the server reads them.
 */
export const briefSchema = z.object({
  title: z.string(),
  body: z.string(),
  status: z.enum(["draft", "scheduled", "published"]),
  source: z.enum(["admin", "ai"]).default("admin"),
  publishAt: optionalTimestamp,
  publishedAt: optionalTimestamp,
  /** Members get a notification when it is published (once). */
  notify: z.boolean().default(true),
  notifiedAt: optionalTimestamp,
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
  updatedAt: timestamp,
})
export type BriefDoc = z.infer<typeof briefSchema> & { id: string }

/** settings/brief: the brief's times on market days, and how the AI writes it when it does. */
export const briefSettingsSchema = z.object({
  /** "05:30", "09:40"... New York time, on market days. */
  times: z.array(z.string()).default(["05:30", "09:40", "10:00", "10:30"]),
  /**
   * When on, the AI writes and posts the brief at each time, following these instructions (the process
   * the team uses today), with the site's own data: index closes, strike targets, spikes, earnings.
   */
  ai: z.object({ enabled: z.boolean(), instructions: z.string() }).default({ enabled: false, instructions: "" }),
})
export type BriefSettings = z.infer<typeof briefSettingsSchema>

// ---- Spikes -------------------------------------------------------------------------------------

/** spikePosts/{id}: one spike list as HG posts it, which members are told about once. */
export const spikePostSchema = z.object({
  title: z.string(),
  /** The session most of its spikes happened in. */
  date: isoDate,
  count: z.number().int(),
  notify: z.boolean().default(true),
  notifiedAt: optionalTimestamp,
  postedAt: timestamp,
  createdBy: z.string().nullable().default(null),
})
export type SpikePostDoc = z.infer<typeof spikePostSchema> & { id: string }

/** spikes/{id}: one stock's spike, from a spike list. HG notes spikes rather than changing the targets. */
export const spikeSchema = z.object({
  postId: z.string(),
  /** Its place in the list as HG wrote it. */
  line: z.number().int().default(0),
  symbol: z.string(),
  price: z.number(),
  date: isoDate,
  /** On the open, on the close, or at another time of day. */
  at: z.enum(["open", "close", "time"]),
  /** "16:20", New York, when known. */
  time: z.string().nullable().default(null),
  /** That session's close: how much trade is left to the spike. */
  close: z.number().nullable().default(null),
  /** Above the close (a buy spike) or below it. */
  direction: z.enum(["up", "down"]),
  group: z.string().nullable().default(null),
  /** The first session after the spike that traded back to its price, and how many sessions it took. */
  recoveredOn: isoDate.nullable().default(null),
  sessionsToRecover: z.number().int().nullable().default(null),
  postedAt: timestamp,
})
export type SpikeDoc = z.infer<typeof spikeSchema> & { id: string }

// ---- Quizzes and tests --------------------------------------------------------------------------

export const quizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  choices: z.array(z.string()),
  /** Index of the correct choice. Never sent to a browser before the member answers. */
  answer: z.number().int(),
  explanation: z.string(),
})
export type QuizQuestion = z.infer<typeof quizQuestionSchema>

/**
 * quizzes/{id}: a bank of questions written by AI from a class document (or by hand), published as a
 * practice quiz for everyone or as a test an admin assigns. Server-only: the answers never reach a browser.
 */
export const quizSchema = z.object({
  title: z.string(),
  description: z.string().nullable().default(null),
  kind: z.enum(["practice", "test"]),
  status: z.enum(["draft", "published", "archived"]),
  source: z
    .object({ name: z.string(), path: z.string().nullable(), contentType: z.string().nullable() })
    .nullable()
    .default(null),
  /** Without a document, what the AI writes questions on (with the team's notes). */
  topic: z.string().nullable().default(null),
  questions: z.array(quizQuestionSchema).default([]),
  /** How many questions one attempt draws from the bank. */
  perAttempt: z.number().int().min(1).max(100).default(10),
  /** Tests: the share of correct answers needed to pass. */
  passScore: z.number().min(0).max(1).default(0.8),
  /** Tests: the level a passing beginner moves up to. */
  awardsLevel: z.enum(TRADER_LEVELS).nullable().default(null),
  /** The AI's work on this quiz: queued by an admin, done by a Cloud Function (or the web server locally). */
  generation: z
    .object({
      status: z.enum(["pending", "running", "done", "failed"]),
      count: z.number().int(),
      message: z.string().nullable().default(null),
      claimId: z.string().nullable().default(null),
      requestedAt: timestamp,
      finishedAt: optionalTimestamp,
    })
    .nullable()
    .default(null),
  createdAt: timestamp,
  createdBy: z.string().nullable().default(null),
  updatedAt: timestamp,
  publishedAt: optionalTimestamp,
})
export type QuizDoc = z.infer<typeof quizSchema> & { id: string }

/** quizAssignments/{id}: an admin asked a member to take a test. One attempt per assignment. */
export const quizAssignmentSchema = z.object({
  quizId: z.string(),
  quizTitle: z.string(),
  uid: z.string(),
  memberName: z.string(),
  status: z.enum(["assigned", "started", "completed", "cancelled"]),
  assignedAt: timestamp,
  assignedBy: z.string().nullable().default(null),
  attemptId: z.string().nullable().default(null),
  score: z.number().nullable().default(null),
  passed: z.boolean().nullable().default(null),
  completedAt: optionalTimestamp,
})
export type QuizAssignmentDoc = z.infer<typeof quizAssignmentSchema> & { id: string }

/** quizAttempts/{id}: one run through a quiz, with the questions it drew and the member's answers. */
export const quizAttemptSchema = z.object({
  quizId: z.string(),
  quizTitle: z.string(),
  kind: z.enum(["practice", "test"]),
  uid: z.string(),
  memberName: z.string(),
  assignmentId: z.string().nullable().default(null),
  questionIds: z.array(z.string()),
  answers: z.array(z.number().int().nullable()),
  correct: z.number().int().default(0),
  score: z.number().nullable().default(null),
  passed: z.boolean().nullable().default(null),
  startedAt: timestamp,
  submittedAt: optionalTimestamp,
})
export type QuizAttemptDoc = z.infer<typeof quizAttemptSchema> & { id: string }

// ---- Class recaps -------------------------------------------------------------------------------

export const classSummaryDocSchema = z.object({
  overview: z.string(),
  keyPoints: z.array(z.string()),
  tickers: z.array(z.object({ symbol: z.string(), note: z.string() })),
  actionItems: z.array(z.string()),
  questions: z.array(z.object({ question: z.string(), answer: z.string() })),
})
export type ClassSummaryDoc = z.infer<typeof classSummaryDocSchema>

/**
 * classRecaps/{id}: one class with the AI summary members read in place of Zoom's. Zoom's webhook
 * creates one when the weekly class's cloud recording transcript is ready; an admin can add one with a
 * transcript file. Only the server reads them; transcripts stay with the admins.
 */
export const classRecapSchema = z.object({
  title: z.string(),
  date: isoDate,
  /** Zoom's id for this occurrence of the meeting, so an event sent twice makes one recap. */
  zoomMeetingUuid: z.string().nullable().default(null),
  transcript: z.object({
    status: z.enum(["pending", "running", "done", "failed"]),
    source: z.enum(["zoom", "upload"]),
    /** The transcript in Cloud Storage (content/...), once there is one. */
    path: z.string().nullable().default(null),
    name: z.string().nullable().default(null),
    contentType: z.string().nullable().default(null),
    /** Zoom's transcript files, until they are downloaded, with the event's short-lived token. */
    downloadUrls: z.array(z.string()).default([]),
    downloadToken: z.string().nullable().default(null),
    message: z.string().nullable().default(null),
    claimId: z.string().nullable().default(null),
    requestedAt: timestamp,
    finishedAt: optionalTimestamp,
  }),
  summary: classSummaryDocSchema.nullable().default(null),
  published: z.boolean().default(false),
  /** Members were told about it: once, the first time it is published. */
  notifiedAt: optionalTimestamp,
  /** The class recording to watch (Zoom's share link, with its passcode), from Zoom or pasted by an admin. */
  recordingUrl: z.string().nullable().default(null),
  /** When an admin last sent the recording to members, and to how many. */
  recordingSentAt: optionalTimestamp,
  recordingSentTo: z.number().int().nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export type ClassRecapDoc = z.infer<typeof classRecapSchema> & { id: string }

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
    .array(
      z.object({
        id: z.string(),
        side: z.enum(["buy", "sell"]),
        quantity: z.number(),
        price: z.number(),
        fees: z.number(),
        executedAt: z.string(),
      }),
    )
    .default([]),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export type TradeDoc = z.infer<typeof tradeSchema> & { id: string }

export const journalDaySchema = z.object({
  date: isoDate,
  body: z.string(),
  mood: z.number().int().min(1).max(5).nullable().default(null),
  updatedAt: timestamp,
})

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
  /** When the position first appeared, for the HG portfolio display delay. */
  firstSeenAt: optionalTimestamp,
})
export type HoldingDoc = z.infer<typeof holdingSchema> & { id: string }

export const snapshotSchema = z.object({
  date: isoDate,
  value: z.number(),
  cash: z.number().nullable().default(null),
  netFlow: z.number().default(0),
})

// ---- Standing ---------------------------------------------------------------------------------

const returnsBlock = z.object({
  week: z.number().nullable(),
  month: z.number().nullable(),
  qtd: z.number().nullable(),
  ytd: z.number().nullable(),
  all: z.number().nullable(),
})
export const standingSchema = z.object({
  computedAt: timestamp,
  hgPortfolio: z
    .object({
      returns: returnsBlock,
      curve: z.array(z.object({ date: isoDate, index: z.number() })),
      value: z.number().nullable(),
      positions: z
        .array(
          z.object({
            instrumentKey: z.string(),
            symbol: z.string(),
            quantity: z.number().nullable(),
            marketValue: z.number().nullable(),
            weight: z.number().nullable(),
          }),
        )
        .nullable(),
      closedTrades: z
        .array(
          z.object({
            instrumentKey: z.string(),
            closedAt: z.string(),
            returnPct: z.number().nullable(),
            realizedPnl: z.number().nullable(),
          }),
        )
        .nullable(),
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
    .object({
      members: z.number(),
      pctGreen: z.number(),
      medianReturn: z.number(),
      averageReturn: z.number(),
      averageWinRate: z.number().nullable(),
      totalTrades: z.number(),
    })
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
  /** When an admin last sent it to members, and to how many. */
  sentAt: optionalTimestamp,
  sentTo: z.number().int().nullable().default(null),
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

/**
 * One weekly class. Rows saved before audiences had names kept free text there ("Mandatory for
 * beginners"); that text becomes the note and the audience is read from it.
 */
const classSessionSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== "object" || raw === null || !("audience" in raw)) return raw
    const { audience } = raw
    if (typeof audience !== "string" || (CLASS_AUDIENCES as readonly string[]).includes(audience)) return raw
    return { note: audience, ...raw, audience: /beginner/i.test(audience) ? "beginners" : "everyone" }
  },
  z.object({
    day: z.number().int().min(0).max(6),
    start: z.string(),
    end: z.string(),
    title: z.string(),
    audience: z.enum(CLASS_AUDIENCES),
    note: z.string().default(""),
  }),
)

export const siteSettingsSchema = z.object({
  bookingUrl: z.url(),
  instagramUrl: z.url().nullable().default(null),
  youtubeUrl: z.url().nullable().default(null),
  xUrl: z.url().nullable().default(null),
  classSchedule: z.array(classSessionSchema).default([]),
  /** Members get a reminder with the Zoom link this many minutes before each class; null turns them off. */
  classReminderMinutes: z.number().int().min(5).max(1440).nullable().default(60),
  /**
   * Visitors can start a free trial from the site. Trial members see HG's alerts, strike targets, market
   * briefs and spikes once they are `delayDays` old; the tools, classes and Chat are open to them.
   */
  trial: z
    .object({
      enabled: z.boolean(),
      days: z.number().int().min(1).max(60),
      delayDays: z.number().int().min(0).max(60),
    })
    .default({ enabled: true, days: 7, delayDays: 7 }),
})
export type SiteSettings = z.infer<typeof siteSettingsSchema>

export const memberSettingsSchema = z.object({
  zoomUrl: z.url().nullable().default(null),
  /**
   * The weekly class's Zoom meeting (digits only; the class link's when empty) and its passcode, so
   * members can join inside the site and recaps are made of this meeting only.
   */
  zoomMeetingId: z.string().nullable().default(null),
  zoomPasscode: z.string().nullable().default(null),
  /** Class recaps go to members as soon as the AI writes them; off, an admin publishes each one. */
  recapsAutoPublish: z.boolean().default(true),
  whatsappUrl: z.url().nullable().default(null),
  oneOnOneUrl: z.url().nullable().default(null),
  setupTags: z.array(z.string()).default(["Channel break", "BOC bounce", "Median reclaim", "Earnings play", "Other"]),
  expiringSoonDays: z.number().int().min(1).max(60).default(14),
  sessionLimit: z.number().int().min(1).max(10).default(2),
  hgPortfolio: z
    .object({
      showDollars: z.boolean(),
      showPositions: z.boolean(),
      showClosedTrades: z.boolean(),
      positionDelayHours: z.number().int().min(0).max(168),
      /** HG standing is open to members from this level up (staff always see it). */
      openFrom: z.enum(TRADER_LEVELS).default("intermediate"),
    })
    .default({
      showDollars: false,
      showPositions: false,
      showClosedTrades: true,
      positionDelayHours: 0,
      openFrom: "intermediate",
    }),
})
export type MemberSettings = z.infer<typeof memberSettingsSchema>

/** How members pay, on every invoice. */
export const wireDetailsSchema = z.object({
  bank: z.string(),
  bankAddress: z.string(),
  swift: z.string(),
  routing: z.string(),
  beneficiary: z.string(),
  beneficiaryAddress: z.string(),
  account: z.string(),
})
export type WireDetails = z.infer<typeof wireDetailsSchema>

export const paymentDetailsSchema = z.object({
  terms: z.string(),
  cashApp: z.string().nullable(),
  wise: z.string().nullable(),
  /** Null until HG enters the bank details. */
  wire: wireDetailsSchema.nullable(),
})
export type PaymentDetails = z.infer<typeof paymentDetailsSchema>

/**
 * settings/billing: who invoices come from, what they say and how to pay. Bank details live here, in
 * Firestore, never in the repository; only the server reads this document.
 */
export const billingSettingsSchema = z.object({
  name: z.string().default("Hubert Gaffney"),
  address: z.string().default(""),
  phone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  /** One quarter of membership, in cents: what a new invoice starts with. */
  quarterPrice: z.number().int().nonnegative().nullable().default(null),
  program: z.string().default("Beginner options and stock strategies, group format. Instructor: Hubert Gaffney."),
  notes: z
    .array(z.string())
    .default([
      "Three one-on-one sessions with HG are included in the enrollment.",
      "Zoom Pro fees are paid by the instructor, at no charge to you.",
    ]),
  payment: paymentDetailsSchema.default({
    terms: "Pay in US dollars by wire transfer, Cash App, or Wise for international payments.",
    cashApp: null,
    wise: null,
    wire: null,
  }),
})
export type BillingSettings = z.infer<typeof billingSettingsSchema>

/** invoices/{id}: an issued invoice. What it says is kept as issued; only its status changes. */
export const invoiceSchema = z.object({
  number: z.string(),
  uid: z.string(),
  status: z.enum(["open", "paid", "void"]),
  issuedOn: isoDate,
  dueOn: isoDate.nullable().default(null),
  from: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  billTo: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
  }),
  program: z.string(),
  lines: z.array(z.object({ description: z.string(), period: z.string().nullable(), amount: z.number().int() })),
  notes: z.array(z.string()),
  /** In cents. */
  total: z.number().int(),
  payment: paymentDetailsSchema,
  paidOn: isoDate.nullable().default(null),
  createdAt: timestamp,
  createdBy: z.string(),
  updatedAt: timestamp,
})
export type InvoiceDoc = z.infer<typeof invoiceSchema> & { id: string }

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  bookingUrl: "https://scheduler.zoom.us/hubert-gaffney/welcome-to-your-meeting-to-join-our-profit-options-team",
  instagramUrl: "https://www.instagram.com/hgprofitoptions",
  youtubeUrl: "https://www.youtube.com/@hgprofitoptions",
  xUrl: "https://x.com/hgprofitoptions",
  classSchedule: [
    {
      day: 0,
      start: "19:00",
      end: "20:30",
      title: "Group class",
      audience: "everyone",
      note: "Sets the tone for the trading week ahead",
    },
    {
      day: 2,
      start: "09:30",
      end: "10:30",
      title: "Beginner session",
      audience: "beginners",
      note: "Live at the market open, reading the data and setups with HG",
    },
    {
      day: 4,
      start: "09:30",
      end: "10:30",
      title: "Beginner session",
      audience: "beginners",
      note: "Live at the market open, reading the data and setups with HG",
    },
  ],
  classReminderMinutes: 60,
  trial: { enabled: true, days: 7, delayDays: 7 },
}

export const adminNotesSchema = z.object({
  body: z.string(),
  updatedAt: timestamp,
  updatedBy: z.string().nullable().default(null),
})

export const jobRunSchema = z.object({
  job: z.string(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  startedAt: timestamp,
  finishedAt: optionalTimestamp,
  detail: z.string().nullable().default(null),
})
export type JobRun = z.infer<typeof jobRunSchema> & { id: string }

export const auditSchema = z.object({
  actorUid: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  /** The action's prefix, stored so the audit log can be filtered in the query. */
  category: z.string().optional(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable().default(null),
  createdAt: timestamp,
})
export type AuditEntry = z.infer<typeof auditSchema> & { id: string }

/**
 * True for a string that names one document: ids from requests are checked with this before use, since
 * a "/" would make Firestore address a document somewhere else.
 */
export function isDocId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 200 &&
    !id.includes("/") &&
    id !== "." &&
    id !== ".." &&
    !/^__.*__$/.test(id)
  )
}

/** Parses a document, attaching its id; returns null (and logs) when the data does not match. */
export function parseDoc<S extends z.ZodType>(
  schema: S,
  id: string,
  data: unknown,
): (z.output<S> & { id: string }) | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.error(`Invalid document ${id}:`, z.prettifyError(result.error))
    return null
  }
  return { ...(result.data as object), id } as z.output<S> & { id: string }
}
