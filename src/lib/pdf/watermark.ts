import "server-only"
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib"

export interface WatermarkOwner {
  name: string
  email: string
  /** e.g. "Oct 7, 2026" */
  date: string
}

export function footerText(owner: WatermarkOwner): string {
  return `Prepared for ${owner.name} (${owner.email}) on ${owner.date}. HG Profit Options member content. Do not share.`
}

/** Stamps every page with a footer naming the member and a faint diagonal email, so shared copies can be traced. */
export async function watermarkPdf(bytes: Uint8Array, owner: WatermarkOwner): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const footer = footerText(owner)
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const size = Math.max(6, Math.min(8, width / 90))
    const textWidth = font.widthOfTextAtSize(footer, size)
    page.drawText(footer, { x: Math.max(12, (width - textWidth) / 2), y: 10, size, font, color: rgb(0.45, 0.45, 0.45) })
    const mark = owner.email
    const markSize = Math.min(width, height) / 14
    const markWidth = font.widthOfTextAtSize(mark, markSize)
    page.drawText(mark, {
      x: width / 2 - (markWidth / 2) * Math.cos(Math.PI / 6),
      y: height / 2 - (markWidth / 2) * Math.sin(Math.PI / 6),
      size: markSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.08,
      rotate: degrees(30),
    })
  }
  return doc.save()
}
