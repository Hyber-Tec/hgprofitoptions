"use client"

import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { LuMoon, LuSun } from "react-icons/lu"
import { Button } from "@/components/ui/button"

const subscribe = () => () => {}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // The theme is only known in the browser; render a neutral icon on the server.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const dark = !mounted || resolvedTheme === "dark"
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <LuSun /> : <LuMoon />}
    </Button>
  )
}
