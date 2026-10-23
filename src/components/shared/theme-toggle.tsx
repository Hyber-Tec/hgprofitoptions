"use client"

import { useTheme } from "@/components/shared/theme"
import { LuMoon, LuSun } from "react-icons/lu"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // The icon and label follow the theme class on <html>, which is set before the page paints, so they are
  // right on the server-rendered page in either area's default.
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <LuMoon className="dark:hidden" />
      <LuSun className="hidden dark:block" />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </Button>
  )
}
