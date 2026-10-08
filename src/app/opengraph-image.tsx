import { ImageResponse } from "next/og"
import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/site/logo-mark-path"

export const alt = "HG Profit Options: options trading education"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Never read files from public/ here: the server bundle would then get a partial public/ folder and
// App Hosting's build would skip copying the real one (every other public file would 404).
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#0a0a0a",
        color: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg viewBox={LOGO_VIEWBOX} width={72} height={72} fill="#fafafa">
          <path fillRule="evenodd" d={LOGO_PATH} />
        </svg>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 600 }}>
          HG Profit<span style={{ color: "#a1a1a1", marginLeft: 10 }}>Options</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1 }}>
          Your journey toward trading excellence begins now
        </div>
        <div style={{ fontSize: 30, color: "#a1a1a1" }}>Live classes · Real-time alerts · Exclusive member tools</div>
      </div>
    </div>,
    size,
  )
}
