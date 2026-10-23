/**
 * Light or dark: the theme a member picked with the toggle, or else their area's. The public site and
 * the sign-in pages open light; the member area and the admin console open dark.
 */

export type ThemeChoice = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_KEY = "theme"
const DARK_AREAS = /^\/(?:members|admin)(?:\/|$)/

export const areaTheme = (pathname: string): ResolvedTheme => (DARK_AREAS.test(pathname) ? "dark" : "light")

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system"
}

export function resolveTheme(choice: ThemeChoice | null, pathname: string, prefersDark: boolean): ResolvedTheme {
  if (choice === "system") return prefersDark ? "dark" : "light"
  return choice ?? areaTheme(pathname)
}

/**
 * The same choice, made before the first paint by an inline script, so a page never flashes the wrong
 * theme. It is serialized with toString, so it must not use anything from outside its body.
 */
function applyStoredTheme(key: string, darkAreas: string) {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(key)
  } catch {
    // Blocked storage: the area's theme.
  }
  const resolved =
    stored === "light" || stored === "dark"
      ? stored
      : stored === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : new RegExp(darkAreas).test(window.location.pathname)
          ? "dark"
          : "light"
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

export const THEME_SCRIPT = `(${applyStoredTheme.toString()})(${JSON.stringify(THEME_KEY)}, ${JSON.stringify(DARK_AREAS.source)})`
