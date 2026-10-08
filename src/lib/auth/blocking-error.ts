/**
 * Sign-up and sign-in blocking functions (invite-only sign-up) reject with a message for the person.
 * Firebase Auth wraps it in an auth/internal-error whose text ends with the function's JSON response:
 * ... returned HTTP error 403: {"error":{"message":"...","status":"PERMISSION_DENIED"}} ...
 */
export function blockingFunctionMessage(errorMessage: string): string | null {
  const json = /\{"error":\{.*\}\}/.exec(errorMessage)?.[0]
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as { error?: { message?: unknown } }
    return typeof parsed.error?.message === "string" && parsed.error.message.trim() !== "" ? parsed.error.message : null
  } catch {
    return null
  }
}
