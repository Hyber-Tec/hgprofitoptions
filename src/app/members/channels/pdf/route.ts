import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatDate, formatLevel } from "@/core/format"
import { getViewer } from "@/lib/auth/guards"
import { drawRow, drawRule, INK, MUTED, type PdfColumn } from "@/lib/pdf/table"
import { watermarkPdf } from "@/lib/pdf/watermark"
import { buildChannelRows } from "@/lib/tools/channels"
import { exportPrices } from "@/lib/tools/prices"

const PAGE = { width: 792, height: 612 } // US Letter, landscape
const MARGIN = 40
const ROW = 14
const LINE = 46
const COLUMNS: PdfColumn[] = [
  { label: "Ticker", width: 46, align: "left" },
  { label: "Price", width: 50, align: "right" },
  { label: "CH", width: 34, align: "right" },
  { label: "BOC", width: 34, align: "right" },
  ...[-4, -3, -2, -1].map((k) => ({ label: `Line ${String(k)}`, width: LINE, align: "right" as const })),
  { label: "Close", width: LINE, align: "right" },
  ...[1, 2, 3, 4].map((k) => ({ label: `Line +${String(k)}`, width: LINE, align: "right" as const })),
  { label: "5D", width: 44, align: "right" },
  { label: "30D", width: 44, align: "right" },
  { label: "90D", width: 44, align: "right" },
]

/**
 * The Median & Channel Chart as a printable, watermarked PDF: each stock's channel lines around its last
 * close, the medians, and its current price (live while market data is connected, else its last close),
 * with the two lines either side of the price in bold.
 */
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const rows = (await buildChannelRows()).sort((a, b) => a.symbol.localeCompare(b.symbol))
  const { prices, label } = await exportPrices(
    rows.map((r) => ({ symbol: r.symbol, lastClose: r.anchor, asOf: r.asOf })),
  )
  const asOf = rows.reduce<IsoDate | null>((latest, r) => (!latest || r.asOf > latest ? r.asOf : latest), null)

  const doc = await PDFDocument.create()
  doc.setTitle(`Median & Channel Chart ${formatDate(todayInMarketZone())}`)
  doc.setAuthor("HG Profit Options")
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page = doc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN
  const header = () => {
    drawRow(
      page,
      bold,
      MARGIN,
      y,
      COLUMNS,
      COLUMNS.map((c) => c.label),
      7.5,
      MUTED,
    )
    y -= 4
    drawRule(page, MARGIN, y, COLUMNS)
    y -= ROW - 3
  }
  page.drawText("Median & Channel Chart", { x: MARGIN, y, size: 18, font: bold })
  y -= 20
  page.drawText(`${asOf ? `Lines from the ${formatDate(asOf)} close. ` : ""}${label}.`, {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: MUTED,
  })
  y -= 24
  header()
  for (const r of rows) {
    if (y < MARGIN + ROW) {
      page = doc.addPage([PAGE.width, PAGE.height])
      y = PAGE.height - MARGIN
      header()
    }
    const price = prices.get(r.symbol) ?? null
    // The lines either side of the price, so the page shows where each stock trades between them.
    const below = price === null ? null : r.lines.filter((v): v is number => v !== null && v <= price).at(-1)
    const above = price === null ? null : r.lines.find((v): v is number => v !== null && v > price)
    drawRow(
      page,
      font,
      MARGIN,
      y,
      COLUMNS,
      [
        { text: r.symbol, font: bold },
        { text: formatLevel(price), font: bold },
        formatLevel(r.ch),
        formatLevel(r.boc),
        ...r.lines.map((v, i) => ({
          text: formatLevel(v),
          font: i === 4 || v === below || v === above ? bold : font,
          color: v === below || v === above ? INK : i === 4 ? INK : rgb(0.3, 0.3, 0.3),
        })),
        formatLevel(r.m5),
        formatLevel(r.m30),
        formatLevel(r.m90),
      ],
      7.5,
    )
    y -= ROW
  }
  if (rows.length === 0) page.drawText("No stocks with channel settings yet.", { x: MARGIN, y, size: 10, font })

  const bytes = await watermarkPdf(await doc.save(), {
    name: viewer.fullName,
    email: viewer.email,
    date: formatDate(todayInMarketZone()),
  })
  // ?print=1 opens it in the browser to print; otherwise it downloads.
  const inline = new URL(request.url).searchParams.has("print")
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="median-channel-chart-${todayInMarketZone()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
