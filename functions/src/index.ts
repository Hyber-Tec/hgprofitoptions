/**
 * Cloud Functions: notifications that must not wait for a browser, the invite-only sign-up guard and the
 * scheduled jobs. The logic lives in src/server (shared with the web app); this file wires triggers,
 * schedules and secrets.
 *
 * Integrations are optional. A secret set to "none" turns its job off; the job records itself as skipped
 * in jobRuns (Admin, Market data).
 */
import { initializeApp } from "firebase-admin/app"
import { getFirestore, type Timestamp } from "firebase-admin/firestore"
import { getMessaging } from "firebase-admin/messaging"
import { onDocumentWritten } from "firebase-functions/firestore"
import { HttpsError, beforeUserCreated } from "firebase-functions/identity"
import { setGlobalOptions } from "firebase-functions/options"
import { defineSecret, defineString } from "firebase-functions/params"
import { onSchedule } from "firebase-functions/scheduler"
import { isIsoDate, todayInMarketZone } from "@/core/dates"
import { deliverAlert, deliverStragglers, publishDueAlerts } from "@/server/alerts"
import { syncAllBrokerages, type BrokerageConfig } from "@/server/brokerage/sync"
import type { EmailConfig } from "@/server/email"
import { pruneJobRuns, runJob, skipped, succeeded } from "@/server/jobs"
import { finalizeWeek, ingestDailyBars } from "@/server/market/jobs"
import type { MarketDataConfig } from "@/server/market/provider"
import { refreshAllAccess } from "@/server/members"
import { COLLECTIONS } from "@/server/model"
import { emailAdminsExpired, notifyTargetsOnce, sendMembershipReminders } from "@/server/notifications"
import { computeStanding } from "@/server/standing"

initializeApp()
// nam5 (US multi-region) Firestore triggers run in us-central1.
setGlobalOptions({ region: "us-central1", maxInstances: 10 })

const NEW_YORK = "America/New_York"

const SITE_URL = defineString("SITE_URL", {
  default: "https://hgprofitoptions.web.app",
  description: "Public address of the site, used in email links",
})
const EMAIL_FROM = defineString("EMAIL_FROM", {
  default: "none",
  description: 'Email sender on a domain verified in Resend, for example "HG Profit Options <alerts@your-domain.com>"',
})
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const SNAPTRADE_CLIENT_ID = defineString("SNAPTRADE_CLIENT_ID", { default: "none" })
const SNAPTRADE_CONSUMER_KEY = defineSecret("SNAPTRADE_CONSUMER_KEY")
const SNAPTRADE_ENCRYPTION_KEY = defineSecret("SNAPTRADE_ENCRYPTION_KEY")
const MARKET_DATA_API_KEY = defineSecret("MARKET_DATA_API_KEY")
const MARKET_DATA_BASE_URL = defineString("MARKET_DATA_BASE_URL", { default: "https://api.polygon.io" })

/** A configured value, or null for an integration that is turned off. */
function configured(value: string): string | null {
  const v = value.trim()
  return v === "" || v.toLowerCase() === "none" ? null : v
}

function emailConfig(): EmailConfig | null {
  const apiKey = configured(RESEND_API_KEY.value())
  const from = configured(EMAIL_FROM.value())
  return apiKey && from ? { apiKey, from } : null
}

function brokerageConfig(): BrokerageConfig | null {
  const clientId = configured(SNAPTRADE_CLIENT_ID.value())
  const consumerKey = configured(SNAPTRADE_CONSUMER_KEY.value())
  const encryptionKey = configured(SNAPTRADE_ENCRYPTION_KEY.value())
  return clientId && consumerKey && encryptionKey ? { clientId, consumerKey, encryptionKey } : null
}

function marketConfig(): MarketDataConfig | null {
  const apiKey = configured(MARKET_DATA_API_KEY.value())
  return apiKey ? { apiKey, baseUrl: MARKET_DATA_BASE_URL.value() } : null
}

const db = () => getFirestore()
const siteUrl = () => SITE_URL.value()

// ---- Notifications --------------------------------------------------------------------------------

/** An alert's notifications go out the moment it is published, now or by the schedule. */
export const deliverAlerts = onDocumentWritten(
  { document: "alerts/{alertId}", secrets: [RESEND_API_KEY], timeoutSeconds: 300 },
  async (event) => {
    const after = event.data?.after
    if (!after?.exists || after.get("status") !== "published" || after.get("delivery")) return
    await deliverAlert(db(), getMessaging(), event.params.alertId, {
      email: emailConfig(),
      siteUrl: siteUrl(),
      claimId: event.id,
    })
  },
)

/** "New strike targets" once per published revision, when HG chose to notify members. */
export const notifyTargets = onDocumentWritten("targetUpdates/{date}", async (event) => {
  const after = event.data?.after
  const date = event.params.date
  if (!after?.exists || after.get("status") !== "published" || after.get("notify") !== true || !isIsoDate(date)) return
  await notifyTargetsOnce(db(), getMessaging(), date, event.id)
})

/** Every minute: publish scheduled alerts that are due, and send any alert a missed trigger left behind. */
export const publishScheduledAlerts = onSchedule(
  { schedule: "every 1 minutes", timeZone: NEW_YORK, secrets: [RESEND_API_KEY], timeoutSeconds: 300 },
  async () => {
    await publishDueAlerts(db())
    await deliverStragglers(db(), getMessaging(), { email: emailConfig(), siteUrl: siteUrl() })
  },
)

// ---- Invite-only sign-up --------------------------------------------------------------------------

/**
 * Accounts are created only for an email with a pending, unexpired invitation (or an existing member,
 * for example after their sign-in method changed). Admin SDK user creation does not pass through here.
 */
export const allowInvitedSignUps = beforeUserCreated(async (event) => {
  const email = event.data?.email?.trim().toLowerCase()
  if (!email) throw new HttpsError("permission-denied", "Sign up with the email address HG invited.")
  const [invite, member] = await Promise.all([
    db().collection(COLLECTIONS.invites).doc(email).get(),
    db().collection(COLLECTIONS.members).where("emailLower", "==", email).limit(1).get(),
  ])
  const expiresAt = invite.get("expiresAt") as Timestamp | undefined
  const invited =
    invite.exists && invite.get("status") === "pending" && (!expiresAt || expiresAt.toMillis() > Date.now())
  if (!invited && member.empty)
    throw new HttpsError(
      "permission-denied",
      "HG Profit Options is invite-only. Use the email address from your invitation, or ask HG for one.",
    )
})

// ---- Scheduled jobs (New York time) ---------------------------------------------------------------

/** 00:15: access windows for the new day (quarters start and end at midnight), the expired digest, cleanup. */
export const nightlyMembership = onSchedule(
  { schedule: "15 0 * * *", timeZone: NEW_YORK, timeoutSeconds: 540, secrets: [RESEND_API_KEY] },
  async () => {
    await runJob(db(), "membership-access", async () =>
      succeeded(`${await refreshAllAccess(db(), todayInMarketZone())} members`),
    )
    await runJob(db(), "expired-digest", async () => {
      const email = emailConfig()
      if (!email) return skipped("Email is not set up")
      const sent = await emailAdminsExpired(db(), email, siteUrl())
      return succeeded(sent === 0 ? "No memberships ended yesterday" : `${sent} admin emails`)
    })
    await pruneJobRuns(db())
  },
)

/** 10:00: renewal reminders 14 and 3 days before a membership ends. */
export const membershipReminders = onSchedule(
  { schedule: "0 10 * * *", timeZone: NEW_YORK, timeoutSeconds: 540, secrets: [RESEND_API_KEY] },
  async () => {
    await runJob(db(), "membership-reminders", async () => {
      const reminded = await sendMembershipReminders(db(), getMessaging(), emailConfig(), siteUrl())
      return succeeded(`${reminded} ${reminded === 1 ? "member" : "members"} reminded`)
    })
  },
)

/** 17:15 on weekdays: refresh linked brokerages, then HG standing from the fresh portfolios. */
export const afterClose = onSchedule(
  {
    schedule: "15 17 * * 1-5",
    timeZone: NEW_YORK,
    timeoutSeconds: 1800,
    memory: "512MiB",
    secrets: [SNAPTRADE_CONSUMER_KEY, SNAPTRADE_ENCRYPTION_KEY],
  },
  async () => {
    await runJob(db(), "brokerage-sync", async () => {
      const config = brokerageConfig()
      if (!config) return skipped("Brokerage linking is not set up")
      const r = await syncAllBrokerages(db(), config)
      return succeeded(`${r.synced} synced, ${r.needsReauth} need to reconnect, ${r.failed} failed`)
    })
    await runJob(db(), "standing", async () => {
      await computeStanding(db(), todayInMarketZone())
      return succeeded()
    })
  },
)

/** 18:30 on weekdays: the session's prices and each ticker's high/low windows. */
export const marketDaily = onSchedule(
  {
    schedule: "30 18 * * 1-5",
    timeZone: NEW_YORK,
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [MARKET_DATA_API_KEY],
  },
  async () => {
    await runJob(db(), "market-daily", async () => {
      const config = marketConfig()
      if (!config) return skipped("No market data provider")
      const today = todayInMarketZone()
      const result = await ingestDailyBars(db(), config, today)
      if (!result) return skipped(`No session on ${today}`)
      const missing = result.missing.length > 0 ? `; no data for ${result.missing.slice(0, 12).join(", ")}` : ""
      return succeeded(`${result.updated} tickers${missing}`)
    })
  },
)

/** Saturday 07:00: Key Market Data for the week that just ended. */
export const marketWeekly = onSchedule(
  { schedule: "0 7 * * 6", timeZone: NEW_YORK, timeoutSeconds: 540, memory: "512MiB", secrets: [MARKET_DATA_API_KEY] },
  async () => {
    await runJob(db(), "market-weekly", async () => {
      if (!marketConfig()) return skipped("No market data provider")
      const week = await finalizeWeek(db(), todayInMarketZone())
      return week.rows > 0
        ? succeeded(`Week of ${week.weekStart}: ${week.rows} tickers`)
        : skipped(`No prices stored for the week of ${week.weekStart}`)
    })
  },
)
