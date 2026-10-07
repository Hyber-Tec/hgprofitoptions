import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

export const alt = "HG Profit Options: options trading education"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpenGraphImage() {
  const svg = await readFile(join(process.cwd(), "public", "media", "logo-mark.svg"), "utf8")
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg.replace('fill="currentColor"', 'fill="#fafafa"')).toString("base64")}`
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
        <img src={logo} width={72} height={72} alt="" />
        <div style={{ fontSize: 36, fontWeight: 600 }}>
          HG Profit <span style={{ color: "#a1a1a1", marginLeft: 10 }}>Options</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
          Your journey toward trading excellence begins now
        </div>
        <div style={{ fontSize: 30, color: "#a1a1a1" }}>Live classes · Real-time alerts · Exclusive member tools</div>
      </div>
    </div>,
    size,
  )
}
