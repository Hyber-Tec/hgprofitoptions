"use client"

import { usePathname } from "next/navigation"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { THEME_KEY, isThemeChoice, resolveTheme, type ResolvedTheme, type ThemeChoice } from "@/core/theme"

interface ThemeValue {
  /** Undefined until the page has loaded in the browser. */
  resolvedTheme: ResolvedTheme | undefined
  setTheme: (choice: ThemeChoice) => void
}

/**
 * Only the setter goes through context, and it never changes. A context change during hydration would
 * reach parts of the page that are still streaming in, and React renders those again in the browser
 * instead of hydrating them, briefly leaving the server's copy in a hidden container beside the page.
 */
const SetThemeContext = createContext<(choice: ThemeChoice) => void>(() => undefined)

/** The theme itself is the class on <html>, which the inline script and the provider keep current. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

function currentTheme(): ResolvedTheme | undefined {
  const classes = document.documentElement.classList
  return classes.contains("dark") ? "dark" : classes.contains("light") ? "light" : undefined
}

export function useTheme(): ThemeValue {
  const resolvedTheme = useSyncExternalStore(subscribe, currentTheme, () => undefined)
  return { resolvedTheme, setTheme: use(SetThemeContext) }
}

function storedChoice(): ThemeChoice | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return isThemeChoice(value) ? value : null
  } catch {
    return null
  }
}

/** Switches the class on <html> without animating every color on the page. */
function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement
  if (root.classList.contains(theme) && root.style.colorScheme === theme) return
  const pause = document.createElement("style")
  pause.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.append(pause)
  root.classList.remove("light", "dark")
  root.classList.add(theme)
  root.style.colorScheme = theme
  // Apply the new colors while transitions are paused, then let them run again.
  window.getComputedStyle(document.body).getPropertyValue("opacity")
  window.setTimeout(() => pause.remove(), 1)
}

/**
 * One theme for the whole app, set in the root layout. The inline script there picks it before the page
 * paints; this keeps it right as members move between areas, pick a theme, or change their system's.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [changes, setChanges] = useState(0)
  /** The choice when storage is blocked, for as long as the page stays open. */
  const unsaved = useRef<ThemeChoice | null>(null)

  useLayoutEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    applyTheme(resolveTheme(storedChoice() ?? unsaved.current, pathname, prefersDark))
  }, [pathname, changes])

  useEffect(() => {
    const changed = () => setChanges((n) => n + 1)
    const fromOtherTab = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) changed()
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    query.addEventListener("change", changed)
    window.addEventListener("storage", fromOtherTab)
    return () => {
      query.removeEventListener("change", changed)
      window.removeEventListener("storage", fromOtherTab)
    }
  }, [])

  const setTheme = useCallback((choice: ThemeChoice) => {
    unsaved.current = choice
    try {
      window.localStorage.setItem(THEME_KEY, choice)
    } catch {
      // Blocked storage: the choice lasts until the page is left.
    }
    setChanges((n) => n + 1)
  }, [])

  return <SetThemeContext value={setTheme}>{children}</SetThemeContext>
}
