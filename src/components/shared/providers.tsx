"use client"

import type { ReactNode } from "react"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

/** App-wide providers. Each area sets its own theme with AreaTheme. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <Toaster>{children}</Toaster>
    </TooltipProvider>
  )
}
