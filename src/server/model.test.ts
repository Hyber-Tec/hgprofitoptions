import { describe, expect, it } from "vitest"
import { isDocId } from "./model"

describe("document ids from requests", () => {
  it("accepts ids that name one document", () => {
    expect(isDocId("hYsqf1Sx4IPNWQwvyLr9")).toBe(true)
    expect(isDocId("zoom-b2NjdXJyZW5jZS1saWdodD09")).toBe(true)
  })

  it("refuses anything that would address another document, or nothing", () => {
    for (const id of ["", "a/b", "x/messages/y", ".", "..", "__name__", "x".repeat(201), 42, null, undefined])
      expect(isDocId(id)).toBe(false)
  })
})
