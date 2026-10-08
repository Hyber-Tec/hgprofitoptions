import { describe, expect, it } from "vitest"
import { blockingFunctionMessage } from "./blocking-error"

describe("blocking function errors", () => {
  it("reads the function's message from the wrapped auth error", () => {
    const message =
      'Firebase: ((HTTP request to http://127.0.0.1:7101/demo/us-central1/allowInvitedSignUps returned HTTP error 403: {"error":{"message":"HG Profit Options is invite-only. Use the email address from your invitation, or ask HG for one.","status":"PERMISSION_DENIED"}})) (auth/internal-error).'
    expect(blockingFunctionMessage(message)).toBe(
      "HG Profit Options is invite-only. Use the email address from your invitation, or ask HG for one.",
    )
  })

  it("keeps the older BLOCKING_FUNCTION_ERROR_RESPONSE wording working", () => {
    const message =
      'Firebase: BLOCKING_FUNCTION_ERROR_RESPONSE : ((HTTP request to https://us-central1-demo.cloudfunctions.net/allowInvitedSignUps returned HTTP error 403: {"error":{"message":"Ask HG for an invitation.","status":"PERMISSION_DENIED"}})) (auth/internal-error).'
    expect(blockingFunctionMessage(message)).toBe("Ask HG for an invitation.")
  })

  it("ignores other internal errors", () => {
    expect(blockingFunctionMessage("Firebase: Error (auth/internal-error).")).toBeNull()
    expect(blockingFunctionMessage('Firebase: {"error":{"message":""}} (auth/internal-error).')).toBeNull()
  })
})
