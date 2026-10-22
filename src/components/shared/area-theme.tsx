"use client"

import { ThemeProvider, useTheme } from "next-themes"
import { useLayoutEffect, useRef, type ReactNode } from "react"

/**
 * The theme for one area of the app. The public site and the sign-in pages open light, the member area
 * and the admin console open dark. A theme picked with the toggle is stored once and applies everywhere.
 */
export function AreaTheme({ defaultTheme, children }: { defaultTheme: "light" | "dark"; children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange>
      <ApplyOnArrival />
      {children}
    </ThemeProvider>
  )
}

/**
 * next-themes' script only runs on a full page load, and it sets the theme after the browser paints. When
 * a click moves to an area with a different default, this sets the theme before the first paint, so the
 * page does not flash and charts read the new area's colors.
 */
function ApplyOnArrival() {
  const { resolvedTheme } = useTheme()
  const applied = useRef(false)
  useLayoutEffect(() => {
    // Later changes come from the toggle and go through next-themes, which pauses transitions for them.
    if (applied.current || (resolvedTheme !== "light" && resolvedTheme !== "dark")) return
    applied.current = true
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])
  return null
}
