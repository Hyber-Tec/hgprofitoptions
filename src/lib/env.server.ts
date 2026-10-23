import "server-only"
import { z } from "zod"

/** Unset, empty or "none" (the placeholder for an optional secret that is turned off) all mean off. */
const optional = z
  .string()
  .optional()
  .transform((v) => {
    const value = v?.trim() ?? ""
    return value === "" || value.toLowerCase() === "none" ? null : value
  })

const schema = z.object({
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  SNAPTRADE_CLIENT_ID: optional,
  SNAPTRADE_CONSUMER_KEY: optional,
  SNAPTRADE_ENCRYPTION_KEY: optional,
  MARKET_DATA_API_KEY: optional,
  MARKET_DATA_BASE_URL: optional,
  AI_API_KEY: optional,
  AI_BASE_URL: optional,
  ZOOM_SDK_KEY: optional,
  ZOOM_SDK_SECRET: optional,
  ZOOM_ACCOUNT_ID: optional,
  ZOOM_CLIENT_ID: optional,
  ZOOM_CLIENT_SECRET: optional,
  ZOOM_WEBHOOK_SECRET: optional,
})

export const serverEnv = schema.parse(process.env)

export const integrations = {
  email: serverEnv.RESEND_API_KEY !== null && serverEnv.EMAIL_FROM !== null,
  brokerage:
    serverEnv.SNAPTRADE_CLIENT_ID !== null &&
    serverEnv.SNAPTRADE_CONSUMER_KEY !== null &&
    serverEnv.SNAPTRADE_ENCRYPTION_KEY !== null,
  marketData: serverEnv.MARKET_DATA_API_KEY !== null,
  ai: serverEnv.AI_API_KEY !== null,
  /** Members join the weekly class inside the site (Zoom Meeting SDK). */
  zoomEmbed: serverEnv.ZOOM_SDK_KEY !== null && serverEnv.ZOOM_SDK_SECRET !== null,
  /** Zoom tells the site when a class transcript is ready, for its AI recap. */
  zoomRecaps: serverEnv.ZOOM_WEBHOOK_SECRET !== null,
}

/** SnapTrade settings, or null when brokerage linking is not configured. */
export function brokerageConfig(): { clientId: string; consumerKey: string; encryptionKey: string } | null {
  const {
    SNAPTRADE_CLIENT_ID: clientId,
    SNAPTRADE_CONSUMER_KEY: consumerKey,
    SNAPTRADE_ENCRYPTION_KEY: encryptionKey,
  } = serverEnv
  return clientId && consumerKey && encryptionKey ? { clientId, consumerKey, encryptionKey } : null
}

/** The market data provider, or null when no key is configured. */
export function marketDataConfig(): { apiKey: string; baseUrl: string } | null {
  const apiKey = serverEnv.MARKET_DATA_API_KEY
  return apiKey ? { apiKey, baseUrl: serverEnv.MARKET_DATA_BASE_URL ?? "https://api.massive.com" } : null
}

/** The AI that writes quiz questions and class summaries, or null when no key is configured. */
export function aiConfig(): { apiKey: string; baseUrl: string | null } | null {
  const apiKey = serverEnv.AI_API_KEY
  return apiKey ? { apiKey, baseUrl: serverEnv.AI_BASE_URL } : null
}

/** The Zoom Meeting SDK app (Client ID and Secret), or null. */
export function zoomSdkConfig(): { sdkKey: string; sdkSecret: string } | null {
  const { ZOOM_SDK_KEY: sdkKey, ZOOM_SDK_SECRET: sdkSecret } = serverEnv
  return sdkKey && sdkSecret ? { sdkKey, sdkSecret } : null
}

/** The Zoom Server-to-Server OAuth app that downloads transcripts when an event has no token, or null. */
export function zoomApiConfig(): { accountId: string; clientId: string; clientSecret: string } | null {
  const { ZOOM_ACCOUNT_ID: accountId, ZOOM_CLIENT_ID: clientId, ZOOM_CLIENT_SECRET: clientSecret } = serverEnv
  return accountId && clientId && clientSecret ? { accountId, clientId, clientSecret } : null
}

export const zoomWebhookSecret = () => serverEnv.ZOOM_WEBHOOK_SECRET

/** Resend settings, or null when email is not configured. EMAIL_FROM must use a domain verified in Resend. */
export function emailConfig(): { apiKey: string; from: string } | null {
  const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = serverEnv
  return apiKey && from ? { apiKey, from } : null
}
