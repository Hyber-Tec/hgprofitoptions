import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import { todayInMarketZone } from "@/core/dates"
import { formatDate, formatExpiry, formatLevel } from "@/core/format"
import { getViewer } from "@/lib/auth/guards"
import { getTargetGroups, getTargetUpdate } from "@/lib/data/tools"
import { watermarkPdf } from "@/lib/pdf/watermark"

const PAGE = { width: 792, height: 612 } // US Letter, landscape
const MARGIN = 40
const ROW = 15
const COLUMNS = [
  { label: "#", width: 30, align: "right" as const },
  { label: "Ticker", width: 80, align: "left" as const },
  { label: "Target", width: 80, align: "right" as const },
  { label: "Break of", width: 80, align: "right" as const },
  { label: "Put strike", width: 80, align: "right" as const },
  { label: "Expiry", width: 60, align: "right" as const },
  { label: "Dow weight", width: 80, align: "right" as const },
]

function drawCells(page: PDFPage, font: PDFFont, y: number, values: string[], size = 9, color = rgb(0.1, 0.1, 0.1)) {
  let x = MARGIN
  values.forEach((value, i) => {
    const column = COLUMNS[i]
    if (!column) return
    const textWidth = font.widthOfTextAtSize(value, size)
    const drawX = column.align === "right" ? x + column.width - textWidth - 6 : x + 6
    page.drawText(value, { x: drawX, y, size, font, color })
    x += column.width
  })
}

/** The strike targets of one update as a printable, watermarked PDF. */
export async function GET(_request: Request, { params }: RouteContext<"/members/targets/[date]/pdf">) {
  const { date } = await params
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const [found, groups] = await Promise.all([getTargetUpdate(date), getTargetGroups()])
  if (!found) return new Response("Not found", { status: 404 })
  const { update } = found

  const doc = await PDFDocument.create()
  doc.setTitle(`Strike Price Targets ${formatDate(update.effectiveDate)}`)
  doc.setAuthor("HG Profit Options")
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page = doc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN
  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height])
    y = PAGE.height - MARGIN
  }
  page.drawText("Strike Price Targets", { x: MARGIN, y, size: 18, font: bold })
  y -= 20
  page.drawText(
    `Update of ${formatDate(update.effectiveDate)}${update.revision > 1 ? ` (corrected, version ${update.revision})` : ""}`,
    { x: MARGIN, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) },
  )
  y -= 26

  const order = new Map(groups.map((g) => [g.slug, g]))
  const slugs = [...new Set(update.entries.map((e) => e.group))].sort(
    (a, b) => (order.get(a)?.order ?? 99) - (order.get(b)?.order ?? 99),
  )
  for (const slug of slugs) {
    const entries = update.entries.filter((e) => e.group === slug).sort((a, b) => a.position - b.position)
    if (y < MARGIN + ROW * 4) newPage()
    page.drawText(order.get(slug)?.name ?? slug, { x: MARGIN, y, size: 11, font: bold })
    y -= ROW
    drawCells(
      page,
      bold,
      y,
      COLUMNS.map((c) => c.label),
      8,
      rgb(0.4, 0.4, 0.4),
    )
    y -= 4
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + COLUMNS.reduce((s, c) => s + c.width, 0), y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    })
    y -= ROW - 4
    for (const e of entries) {
      if (y < MARGIN + ROW) newPage()
      drawCells(page, font, y, [
        String(e.position),
        e.symbol,
        formatLevel(e.target),
        formatLevel(e.breakLevel),
        formatLevel(e.putStrike),
        formatExpiry(e.expiry),
        e.dowWeight === null ? "" : `${formatLevel(e.dowWeight)}%`,
      ])
      y -= ROW
    }
    y -= ROW
  }

  const bytes = await watermarkPdf(await doc.save(), {
    name: viewer.fullName,
    email: viewer.email,
    date: formatDate(todayInMarketZone()),
  })
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="strike-price-targets-${update.effectiveDate}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
