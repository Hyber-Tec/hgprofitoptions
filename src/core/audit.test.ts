import { describe, expect, it } from "vitest"
import { auditCategory, describeAuditAction, formatAuditDetail } from "./audit"

describe("audit vocabulary", () => {
  it("derives the category from the action prefix", () => {
    expect(auditCategory("member.viewed_journal")).toBe("member")
    expect(auditCategory("targets.published")).toBe("targets")
  })

  it("describes known and unknown actions in plain words", () => {
    expect(describeAuditAction("period.renewed")).toBe("Renewed for the next quarter")
    expect(describeAuditAction("brokerage.sync_failed")).toBe("Brokerage sync failed")
  })

  it("formats details without ids and with list lengths", () => {
    expect(formatAuditDetail({ entries: 94, revision: 1 })).toBe("entries 94 · revision 1")
    expect(formatAuditDetail({ followUpId: "abc", kind: "trim", exits: [1, 2] })).toBe("kind trim · exits 2")
    expect(formatAuditDetail({ publishAt: "2026-10-08T13:30:00.000Z" })).toBe("publish at 2026-10-08T13:30:00.000Z")
    expect(formatAuditDetail(null)).toBe("")
  })
})
