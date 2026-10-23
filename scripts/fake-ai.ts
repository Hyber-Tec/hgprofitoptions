/**
 * A stand-in for the AI API, for local development and the end-to-end tests only. It answers the two
 * requests the app makes (quiz questions from a document, a class summary from a transcript) with
 * simple answers built from the text it was sent, so the flows can be tried without a paid key.
 *
 *   pnpm ai:fake          # http://127.0.0.1:7657; then set in .env.local:
 *                         #   AI_API_KEY=fake  AI_BASE_URL=http://127.0.0.1:7657
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

const portArg = process.argv.find((a) => a.startsWith("--port="))
const port = Number(portArg?.slice("--port=".length) ?? 7657)

interface Block {
  type: string
  text?: string
  title?: string
  source?: { type: string; data?: string }
}
interface Request {
  system?: string
  messages?: { role: string; content: string | Block[] }[]
}

function read(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk: string) => (body += chunk))
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 220)

/** Swaps a number or a key word, so a wrong answer reads like the right one. */
function alter(sentence: string, n: number): string {
  if (/\d/.test(sentence)) return sentence.replace(/\d+(\.\d+)?/, (m) => String(Number(m) * (n + 2)))
  const swaps: [RegExp, string][] = [
    [/\babove\b/i, "below"],
    [/\bbelow\b/i, "above"],
    [/\bbefore\b/i, "after"],
    [/\bafter\b/i, "before"],
    [/\balways\b/i, "never"],
    [/\bcall\b/i, "put"],
    [/\bput\b/i, "call"],
  ]
  const swap = swaps[(n + sentence.length) % swaps.length]
  if (swap && swap[0].test(sentence)) return sentence.replace(swap[0], swap[1])
  const prefix = ["Never: ", "Only on Fridays: ", "Only after earnings: "][n % 3] ?? ""
  return `${prefix}${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`
}

function quiz(request: Request): unknown {
  const content = request.messages?.at(-1)?.content
  const blocks = Array.isArray(content) ? content : []
  const ask = blocks.find((b) => b.type === "text")?.text ?? ""
  const count = Number(/Write (\d+) questions/.exec(ask)?.[1] ?? 5)
  const doc = blocks.find((b) => b.type === "document")
  const text = doc?.source?.type === "text" ? (doc.source.data ?? "") : ""
  const title = doc?.title ?? "the document"
  const facts = sentences(text)
  const questions = Array.from({ length: count }, (_, i) => {
    const fact = facts[i % Math.max(facts.length, 1)]
    if (!fact)
      return {
        prompt: `Question ${i + 1}: what is the main subject of ${title}?`,
        correct: `The ideas taught in ${title}`,
        wrong: ["The weather", "A sports score", "A recipe"],
        explanation: `${title} is a class document, so it covers the class material.`,
      }
    return {
      prompt: `Question ${i + 1}: which of these does ${title} say?`,
      correct: fact,
      wrong: [alter(fact, 0), alter(fact, 1), alter(fact, 2)],
      explanation: `The document says: "${fact}"`,
    }
  })
  return { questions }
}

/** Who said each sentence of a transcript ("Speaker: words" lines), in order. */
function spoken(transcript: string): { speaker: string; sentence: string }[] {
  return transcript.split("\n").flatMap((line) => {
    const match = /^([^:]{1,40}):\s*(.*)$/.exec(line.trim())
    const speaker = match?.[1] ?? ""
    return (match?.[2] ?? line)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)
      .map((sentence) => ({ speaker, sentence }))
  })
}

function summary(request: Request): unknown {
  const content = request.messages?.at(-1)?.content
  const blocks = Array.isArray(content) ? content : []
  const known = new Set(
    (blocks.find((b) => b.type === "text" && b.text?.startsWith("Tickers the class follows"))?.text ?? "")
      .replace(/^[^:]*:/, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  const transcript = blocks.find((b) => b.type === "document")?.source?.data ?? ""
  const said = spoken(transcript)
  const teacher = said[0]?.speaker
  const taught = said.filter((s) => s.speaker === teacher && !s.sentence.endsWith("?"))
  const lessons = taught.filter((s) => s.sentence.length > 40 && !/welcome|good evening/i.test(s.sentence))
  const mentioned = [...new Set(transcript.match(/\b[A-Z]{2,5}\b/g) ?? [])].filter((t) => known.has(t))
  return {
    overview:
      lessons
        .slice(0, 2)
        .map((s) => s.sentence)
        .join(" ") || "The class reviewed the week's setups.",
    keyPoints: lessons
      .filter((s) => !/homework|before next class/i.test(s.sentence))
      .slice(0, 4)
      .map((s) => s.sentence),
    tickers: mentioned.map((symbol) => ({
      symbol,
      note:
        said.find((s) => s.sentence.includes(symbol) && !/homework/i.test(s.sentence))?.sentence ??
        `${symbol} was discussed.`,
    })),
    actionItems: said
      .filter((s) => /homework|before next class|this week/i.test(s.sentence))
      .slice(0, 3)
      .map((s) => s.sentence.replace(/^For homework before next class,\s*/i, "").replace(/^./, (c) => c.toUpperCase())),
    questions: said
      .flatMap((asked, i) => {
        if (!asked.sentence.endsWith("?")) return []
        const start = said.findIndex((a, j) => j > i && a.speaker !== asked.speaker)
        const by = said[start]?.speaker
        if (start === -1 || by === undefined) return []
        const answer = said
          .slice(start, start + 2)
          .filter((a) => a.speaker === by)
          .map((a) => a.sentence)
          .join(" ")
        return [{ question: asked.sentence, answer }]
      })
      .slice(0, 3),
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
  if (url.pathname === "/health") return send(res, 200, { ok: true })
  if (req.method !== "POST" || url.pathname !== "/v1/messages")
    return send(res, 404, { type: "error", error: { type: "not_found_error", message: "Not found" } })
  void read(req).then((raw) => {
    const request = JSON.parse(raw) as Request
    const answer = /quiz questions/i.test(request.system ?? "") ? quiz(request) : summary(request)
    send(res, 200, {
      id: `msg_fake_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: "fake",
      content: [{ type: "text", text: JSON.stringify(answer) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: Math.round(raw.length / 4), output_tokens: 200 },
    })
  })
})

server.listen(port, "127.0.0.1", () => console.log(`Fake AI on http://127.0.0.1:${port}`))
