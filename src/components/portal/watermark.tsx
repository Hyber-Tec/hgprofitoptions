/**
 * A faint, repeating watermark with the member's email over tool pages, so screenshots that get
 * shared can be traced. It never blocks clicks and is hidden from screen readers.
 */
export function Watermark({ text }: { text: string }) {
  const safe = text.replace(/[<>&"']/g, "")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="0" y="110" transform="rotate(-24 180 100)" font-family="system-ui, sans-serif" font-size="14" fill="currentColor">${safe}</text></svg>`
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 text-foreground opacity-[0.04] print:opacity-[0.08]"
      style={{
        backgroundColor: "currentColor",
        maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        WebkitMaskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
      }}
    />
  )
}
