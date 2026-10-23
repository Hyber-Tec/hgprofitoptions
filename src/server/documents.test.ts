import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { AiError } from "./ai"
import { aiDocument, docxText } from "./documents"

function docx(bodyXml: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${bodyXml}</w:body></w:document>`,
    ),
  })
}

describe("Word documents", () => {
  it("reads paragraphs, runs, tabs, breaks and entities", () => {
    const data = docx(
      `<w:p><w:r><w:t>Channels &amp; BOC</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">A channel is </w:t></w:r><w:r><w:t>6.50</w:t></w:r><w:r><w:tab/><w:t>wide</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>line two &#233;t&#233; done</w:t></w:r></w:p>`,
    )
    expect(docxText(data)).toBe("Channels & BOC\nA channel is 6.50\twide\nLine one\nline two été done")
  })

  it("explains a file that is not a Word document", () => {
    expect(() => docxText(strToU8("not a zip"))).toThrow(AiError)
  })
})

describe("documents for the AI", () => {
  it("sends PDFs as they are and other files as text", () => {
    const pdf = new Uint8Array([37, 80, 68, 70])
    expect(aiDocument("Slides.PDF", pdf, null)).toEqual({ kind: "pdf", name: "Slides.PDF", data: pdf })
    expect(aiDocument("notes.txt", strToU8("Hello"), "text/plain")).toEqual({
      kind: "text",
      name: "notes.txt",
      text: "Hello",
    })
    expect(aiDocument("lesson.docx", docx("<w:p><w:r><w:t>Hi</w:t></w:r></w:p>"), null)).toEqual({
      kind: "text",
      name: "lesson.docx",
      text: "Hi",
    })
  })

  it("asks for a PDF when it cannot read the file", () => {
    expect(() => aiDocument("deck.pptx", new Uint8Array(4), null)).toThrow("Export this file to PDF")
  })
})
