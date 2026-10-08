"use client"

import { useState } from "react"

/**
 * Open state for an add/edit dialog. The target outlives `close()` so the dialog's title and
 * fields don't switch to the other mode while it animates out.
 */
export function useEditorDialog<T>() {
  const [state, setState] = useState<{ open: boolean; target: T | null }>({ open: false, target: null })
  return {
    open: state.open,
    /** The item being edited, or null when adding a new one. */
    target: state.target,
    show: (target: T | null) => setState({ open: true, target }),
    close: () => setState((s) => ({ ...s, open: false })),
    onOpenChange: (open: boolean) => setState((s) => ({ ...s, open })),
  }
}
