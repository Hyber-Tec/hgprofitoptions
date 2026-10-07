import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { open, seal } from "./secret-box"

describe("secret box", () => {
  it("round-trips and detects tampering", () => {
    const key = randomBytes(32).toString("base64")
    const sealed = seal("user-secret-123", key)
    expect(sealed).not.toContain("user-secret-123")
    expect(open(sealed, key)).toBe("user-secret-123")
    const parts = sealed.split(".")
    parts[3] = Buffer.from("tampered").toString("base64")
    expect(() => open(parts.join("."), key)).toThrow()
    expect(() => open(sealed, randomBytes(32).toString("base64"))).toThrow()
  })
})
