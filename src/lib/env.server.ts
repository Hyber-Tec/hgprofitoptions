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
})

export const serverEnv = schema.parse(process.env)

export const integrations = {
  email: serverEnv.RESEND_API_KEY !== null && serverEnv.EMAIL_FROM !== null,
  brokerage:
    serverEnv.SNAPTRADE_CLIENT_ID !== null &&
    serverEnv.SNAPTRADE_CONSUMER_KEY !== null &&
    serverEnv.SNAPTRADE_ENCRYPTION_KEY !== null,
  marketData: serverEnv.MARKET_DATA_API_KEY !== null,
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

/** Resend settings, or null when email is not configured. EMAIL_FROM must use a domain verified in Resend. */
export function emailConfig(): { apiKey: string; from: string } | null {
  const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = serverEnv
  return apiKey && from ? { apiKey, from } : null
}
