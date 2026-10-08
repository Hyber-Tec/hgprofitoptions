"use client"

import { getMessaging, isSupported, onRegistered, register, unregister, type Messaging } from "firebase/messaging"
import { publicEnv } from "@/lib/env.public"
import { firebaseApp } from "@/lib/firebase/client"
import { registerPushToken, removePushToken } from "@/lib/actions/notifications"

const STORAGE_KEY = "hg-push-token"
const SW_URL = "/firebase-messaging-sw.js"
const SW_SCOPE = "/firebase-cloud-messaging-push-scope"

export type PushStatus = "unsupported" | "ios-install" | "denied" | "off" | "on"

function isIos(): boolean {
  // iPadOS reports a Mac user agent, so a touch screen gives it away.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

/** Registers this browser with FCM and resolves with its Firebase Installation ID. */
function registerInstallation(
  messaging: Messaging,
  options: { serviceWorkerRegistration: ServiceWorkerRegistration; vapidKey?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error("Registration timed out"))
    }, 20_000)
    const stop = onRegistered(messaging, (fid) => {
      clearTimeout(timer)
      stop()
      resolve(fid)
    })
    register(messaging, options).catch((error: unknown) => {
      clearTimeout(timer)
      stop()
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Whether this browser can get HG's alerts as notifications, and whether it already does. */
export async function getPushStatus(): Promise<PushStatus> {
  const supported = await isSupported().catch(() => false)
  if (!supported) return isIos() && !isStandalone() ? "ios-install" : "unsupported"
  if (Notification.permission === "denied") return "denied"
  return Notification.permission === "granted" && storedToken() ? "on" : "off"
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      return {
        ok: false,
        message:
          permission === "denied"
            ? "Notifications are blocked for this site. Allow them in your browser's site settings."
            : "Notifications were not turned on.",
      }
    }
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
    const vapidKey = publicEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    const token = await registerInstallation(getMessaging(firebaseApp()), {
      serviceWorkerRegistration: registration,
      ...(vapidKey ? { vapidKey } : {}),
    })
    const result = await registerPushToken({ token, userAgent: navigator.userAgent })
    if (!result.ok) return { ok: false, message: result.message }
    try {
      localStorage.setItem(STORAGE_KEY, token)
    } catch {
      // Private mode: notifications still work, the switch just will not remember this browser.
    }
    return { ok: true }
  } catch (error) {
    console.error("enablePush", error)
    return {
      ok: false,
      message: "This browser could not be registered for notifications. Try again, or use another browser.",
    }
  }
}

export async function disablePush(): Promise<void> {
  const token = storedToken()
  try {
    await unregister(getMessaging(firebaseApp()))
  } catch (error) {
    console.warn("unregister", error)
  }
  if (token) await removePushToken({ token })
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors.
  }
}
