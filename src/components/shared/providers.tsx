"use client"

import type { ReactNode } from "react"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "./theme"

/** App-wide providers. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster>{children}</Toaster>
      </TooltipProvider>
    </ThemeProvider>
  )
}
