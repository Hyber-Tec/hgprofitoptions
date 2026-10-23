import { describe, expect, it } from "vitest"
import { THEME_SCRIPT, areaTheme, isThemeChoice, resolveTheme } from "./theme"

/** Runs the inline script against a stand-in browser and returns the class it set. */
function runScript(stored: string | null, pathname: string, prefersDark = false, blocked = false) {
  const classes = new Set<string>(["light"])
  const root = {
    classList: {
      remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
      add: (name: string) => classes.add(name),
    },
    style: { colorScheme: "" },
  }
  const window = {
    localStorage: {
      getItem: () => {
        if (blocked) throw new Error("SecurityError")
        return stored
      },
    },
    matchMedia: () => ({ matches: prefersDark }),
    location: { pathname },
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const script = new Function("window", "document", THEME_SCRIPT) as (window: unknown, document: unknown) => void
  script(window, { documentElement: root })
  return { classes: [...classes], colorScheme: root.style.colorScheme }
}

describe("theme", () => {
  it("opens the member area and the admin console dark, everything else light", () => {
    expect(areaTheme("/members")).toBe("dark")
    expect(areaTheme("/members/classroom/live")).toBe("dark")
    expect(areaTheme("/admin/settings")).toBe("dark")
    expect(areaTheme("/")).toBe("light")
    expect(areaTheme("/login")).toBe("light")
    expect(areaTheme("/membership")).toBe("light")
  })

  it("follows a picked theme everywhere, and the system when asked", () => {
    expect(resolveTheme("light", "/members", true)).toBe("light")
    expect(resolveTheme("dark", "/", false)).toBe("dark")
    expect(resolveTheme("system", "/", true)).toBe("dark")
    expect(resolveTheme("system", "/members", false)).toBe("light")
    expect(resolveTheme(null, "/admin", false)).toBe("dark")
    expect(isThemeChoice("dark")).toBe(true)
    expect(isThemeChoice("sepia")).toBe(false)
  })

  it("sets the same theme before the first paint", () => {
    expect(runScript(null, "/members/targets")).toEqual({ classes: ["dark"], colorScheme: "dark" })
    expect(runScript(null, "/about")).toEqual({ classes: ["light"], colorScheme: "light" })
    expect(runScript("light", "/admin")).toEqual({ classes: ["light"], colorScheme: "light" })
    expect(runScript("system", "/", true)).toEqual({ classes: ["dark"], colorScheme: "dark" })
    expect(runScript("dark", "/", false, true)).toEqual({ classes: ["light"], colorScheme: "light" })
  })
})
