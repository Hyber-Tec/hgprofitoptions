/** AES-256-GCM for SnapTrade user secrets at rest. The key is 32 random bytes, base64-encoded. */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function key(base64Key: string): Buffer {
  const k = Buffer.from(base64Key, "base64")
  if (k.length !== 32)
    throw new Error("SNAPTRADE_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).")
  return k
}

export function seal(plaintext: string, base64Key: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(base64Key), iv)
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".")
}

export function open(sealed: string, base64Key: string): string {
  const [version, iv, tag, data] = sealed.split(".")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized sealed secret.")
  const decipher = createDecipheriv("aes-256-gcm", key(base64Key), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}
