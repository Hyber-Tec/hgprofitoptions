import "server-only"
import { z } from "zod"

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))

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
  email: serverEnv.RESEND_API_KEY !== null,
  brokerage: serverEnv.SNAPTRADE_CLIENT_ID !== null && serverEnv.SNAPTRADE_CONSUMER_KEY !== null && serverEnv.SNAPTRADE_ENCRYPTION_KEY !== null,
  marketData: serverEnv.MARKET_DATA_API_KEY !== null,
}
