/** Turns an uploaded class document into something the AI can read: a PDF as is, Word and text files as text. */
import { strFromU8, unzipSync } from "fflate"
import { AiError, type AiDocument } from "./ai"

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)))
    return ENTITIES[entity] ?? match
  })
}

/** The text of a .docx: paragraphs on their own lines, tabs and line breaks kept. */
export function docxText(data: Uint8Array): string {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" })
  } catch {
    throw new AiError("This Word file could not be opened. Save it again as .docx or PDF.", false)
  }
  const xml = files["word/document.xml"]
  if (!xml) throw new AiError("This Word file could not be opened. Save it again as .docx or PDF.", false)
  const body = strFromU8(xml)
  const paragraphs = body.split(/<\/w:p>/)
  return paragraphs
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
        .map((m) => (m[0] === "<w:tab/>" ? "\t" : m[0] === "<w:br/>" ? "\n" : decodeXml(m[1] ?? "")))
        .join(""),
    )
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Reads a stored file as a document for the AI, by its type or file extension. */
export function aiDocument(name: string, data: Uint8Array, contentType: string | null): AiDocument {
  const lower = name.toLowerCase()
  if (contentType === "application/pdf" || lower.endsWith(".pdf")) return { kind: "pdf", name, data }
  if (contentType === DOCX || lower.endsWith(".docx")) return { kind: "text", name, text: docxText(data) }
  if (contentType?.startsWith("text/") || /\.(txt|md|markdown|vtt|srt)$/.test(lower))
    return { kind: "text", name, text: strFromU8(data) }
  throw new AiError("The AI reads PDF, Word (.docx) and text files. Export this file to PDF and try again.", false)
}
