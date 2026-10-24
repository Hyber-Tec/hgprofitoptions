import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { todayInMarketZone } from "@/core/dates"
import { formatDate, formatExpiry, formatLevel, formatPercent } from "@/core/format"
import { TARGET_STATUS_LABELS, targetStatus } from "@/core/parsers/strike-targets"
import { getViewer } from "@/lib/auth/guards"
import { getTargetGroups, getTargetUpdate, tickerMap } from "@/lib/data/tools"
import { postsCutoff } from "@/lib/data/visibility"
import { drawRow, drawRule, INK, MUTED, type PdfColumn } from "@/lib/pdf/table"
import { watermarkPdf } from "@/lib/pdf/watermark"
import { exportPrices } from "@/lib/tools/prices"

const PAGE = { width: 792, height: 612 } // US Letter, landscape
const MARGIN = 40
const ROW = 15
const COLUMNS: PdfColumn[] = [
  { label: "#", width: 26, align: "right" },
  { label: "Ticker", width: 64, align: "left" },
  { label: "Price", width: 72, align: "right" },
  { label: "Target", width: 72, align: "right" },
  { label: "To target", width: 62, align: "right" },
  { label: "Break of", width: 72, align: "right" },
  { label: "Put strike", width: 72, align: "right" },
  { label: "Expiry", width: 50, align: "right" },
  { label: "Dow weight", width: 70, align: "right" },
  { label: "Status", width: 88, align: "left" },
]

/**
 * The strike targets of one update as a printable, watermarked PDF, with each stock's current price
 * (live while market data is connected, else its last close) and where it sits against the levels.
 */
export async function GET(_request: Request, { params }: RouteContext<"/members/targets/[date]/pdf">) {
  const { date } = await params
  const viewer = await getViewer()
  if (!viewer?.hasAccess) return new Response("Not found", { status: 404 })
  const [found, groups, tickers] = await Promise.all([
    getTargetUpdate(date, await postsCutoff(viewer)),
    getTargetGroups(),
    tickerMap(),
  ])
  if (!found) return new Response("Not found", { status: 404 })
  const { update } = found
  const { prices, label } = await exportPrices(
    [...new Set(update.entries.map((e) => e.symbol))].map((symbol) => ({
      symbol,
      lastClose: tickers.get(symbol)?.metrics?.lastClose ?? null,
      asOf: tickers.get(symbol)?.metrics?.asOf ?? null,
    })),
  )

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
    `Update of ${formatDate(update.effectiveDate)}${update.revision > 1 ? ` (corrected, version ${String(update.revision)})` : ""}. ${label}.`,
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
    drawRow(
      page,
      bold,
      MARGIN,
      y,
      COLUMNS,
      COLUMNS.map((c) => c.label),
      8,
      MUTED,
    )
    y -= 4
    drawRule(page, MARGIN, y, COLUMNS)
    y -= ROW - 4
    for (const e of entries) {
      if (y < MARGIN + ROW) newPage()
      const price = prices.get(e.symbol) ?? null
      const status = price === null ? null : targetStatus(price, e)
      drawRow(page, font, MARGIN, y, COLUMNS, [
        String(e.position),
        { text: e.symbol, font: bold },
        formatLevel(price),
        formatLevel(e.target),
        price === null ? "-" : formatPercent((e.target - price) / price, { digits: 1 }),
        formatLevel(e.breakLevel),
        formatLevel(e.putStrike),
        formatExpiry(e.expiry),
        e.dowWeight === null ? "" : `${formatLevel(e.dowWeight)}%`,
        status
          ? {
              text: TARGET_STATUS_LABELS[status],
              color:
                status === "above-target" ? rgb(0.02, 0.45, 0.25) : status === "below-break" ? rgb(0.7, 0.1, 0.1) : INK,
            }
          : "-",
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
