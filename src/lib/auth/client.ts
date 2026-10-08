"use client"

import { FirebaseError } from "firebase/app"
import {
  GoogleAuthProvider,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type MultiFactorResolver,
  type User,
} from "firebase/auth"
import { clientAuth } from "@/lib/firebase/client"
import { blockingFunctionMessage } from "./blocking-error"

export type SignInResult =
  | { kind: "ok"; role: "admin" | "member" }
  | { kind: "mfa"; resolver: MultiFactorResolver }
  | { kind: "error"; message: string }

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password do not match.",
  "auth/user-disabled": "This account has been disabled. Please contact HG.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
  "auth/cancelled-popup-request": "The Google window was closed before signing in.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/account-exists-with-different-credential":
    "This email already signs in with a password. Use your password, then link Google in Settings.",
  "auth/invalid-verification-code": "That code is not correct. Try the newest code from your authenticator app.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/email-already-in-use": "An account already exists for this email. Sign in instead.",
  "auth/weak-password": "Choose a stronger password (at least 8 characters).",
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/internal-error") {
      const blocked = blockingFunctionMessage(error.message)
      if (blocked) return blocked
    }
    return MESSAGES[error.code] ?? "Something went wrong. Please try again."
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again."
}

/** Exchanges the Firebase sign-in for a server session cookie. */
export async function establishSession(
  user: User,
  options: { inviteToken?: string; acceptTerms?: boolean } = {},
): Promise<SignInResult> {
  const idToken = await user.getIdToken(true)
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, ...options }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    role?: "admin" | "member"
    message?: string
  }
  if (!response.ok || !body.ok || !body.role) {
    await firebaseSignOut(clientAuth())
    return { kind: "error", message: body.message ?? "We could not sign you in. Please try again." }
  }
  // Refresh claims (for example the admin role) for live data in the browser.
  await user.getIdToken(true)
  return { kind: "ok", role: body.role }
}

async function handle(
  signIn: () => Promise<User>,
  options: { inviteToken?: string; acceptTerms?: boolean } = {},
): Promise<SignInResult> {
  try {
    const user = await signIn()
    return await establishSession(user, options)
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "auth/multi-factor-auth-required") {
      return {
        kind: "mfa",
        resolver: getMultiFactorResolver(clientAuth(), error as Parameters<typeof getMultiFactorResolver>[1]),
      }
    }
    return { kind: "error", message: authErrorMessage(error) }
  }
}

export function signInWithPassword(
  email: string,
  password: string,
  options?: { inviteToken?: string; acceptTerms?: boolean },
): Promise<SignInResult> {
  return handle(async () => (await signInWithEmailAndPassword(clientAuth(), email, password)).user, options)
}

export function signInWithGoogle(options?: {
  inviteToken?: string
  acceptTerms?: boolean
  loginHint?: string
}): Promise<SignInResult> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({
    prompt: "select_account",
    ...(options?.loginHint ? { login_hint: options.loginHint } : {}),
  })
  return handle(async () => (await signInWithPopup(clientAuth(), provider)).user, options)
}

/** Completes a sign-in that needs the authenticator app code. */
export async function completeTotp(
  resolver: MultiFactorResolver,
  code: string,
  options?: { inviteToken?: string; acceptTerms?: boolean },
): Promise<SignInResult> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
  if (!hint) return { kind: "error", message: "No authenticator app is set up for this account." }
  try {
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code)
    const credential = await resolver.resolveSignIn(assertion)
    return await establishSession(credential.user, options)
  } catch (error) {
    return { kind: "error", message: authErrorMessage(error) }
  }
}

/** Signs out of this browser: removes the server session and the Firebase sign-in. */
export async function signOut(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined)
  await firebaseSignOut(clientAuth()).catch(() => undefined)
}
