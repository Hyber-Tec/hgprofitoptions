import "server-only"
import { todayInMarketZone } from "@/core/dates"
import { formatDate } from "@/core/format"
import type { Viewer } from "@/lib/auth/guards"
import { readStoredFile } from "@/lib/data/content"
import { watermarkPdf } from "./watermark"

const safeName = (name: string) =>
  name
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-") || "file"

/**
 * Streams a stored member file. PDFs are stamped with the member's name, email and the date.
 * `download` switches between opening in the browser and saving.
 */
export async function serveMemberFile(
  viewer: Viewer,
  input: { path: string; title: string; mimeType: string | null; download: boolean },
): Promise<Response> {
  const { data, contentType } = await readStoredFile(input.path)
  const type = input.mimeType ?? contentType ?? "application/octet-stream"
  const isPdf = type === "application/pdf" || input.path.toLowerCase().endsWith(".pdf")
  const body = isPdf
    ? await watermarkPdf(new Uint8Array(data), {
        name: viewer.fullName,
        email: viewer.email,
        date: formatDate(todayInMarketZone()),
      })
    : new Uint8Array(data)
  const extension = input.path.split(".").at(-1) ?? (isPdf ? "pdf" : "bin")
  const filename = `${safeName(input.title)}.${extension}`
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : type,
      "Content-Disposition": `${input.download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
