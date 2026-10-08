import { ImageResponse } from "next/og"
import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/site/logo-mark-path"

export const alt = "HG Profit Options: trade options with a plan, not a guess"
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
        color: "#e8edf8",
        backgroundColor: "#050914",
        backgroundImage:
          "radial-gradient(ellipse 70% 60% at 85% 0%, rgba(61, 107, 247, 0.38), transparent 70%), radial-gradient(ellipse 60% 50% at 0% 100%, rgba(76, 201, 240, 0.16), transparent 70%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg viewBox={LOGO_VIEWBOX} width={72} height={72} fill="#e8edf8">
            <path fillRule="evenodd" d={LOGO_PATH} />
          </svg>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 600 }}>
            HG Profit<span style={{ color: "#8e9ab9", marginLeft: 10 }}>Options</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 20px",
            borderRadius: 999,
            border: "1px solid rgba(148, 170, 230, 0.25)",
            fontSize: 22,
            color: "#c3cde6",
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: "#34d399" }} />
          Live classes every Saturday
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.04, letterSpacing: -2 }}>
          <span>Trade options with a plan,</span>
          <span style={{ color: "#6e9bff" }}>not a guess.</span>
        </div>
        <div style={{ fontSize: 30, color: "#8e9ab9" }}>
          Live classes · One-on-one with HG · Real-time alerts · Member tools
        </div>
      </div>
    </div>,
    size,
  )
}
