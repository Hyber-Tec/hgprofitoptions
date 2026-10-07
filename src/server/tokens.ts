import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** A URL-safe random token for invite links; only its SHA-256 hash is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex")
  const b = Buffer.from(hash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}
