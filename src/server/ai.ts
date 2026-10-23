/**
 * The site's AI: it writes practice questions from class documents and summarizes class transcripts.
 * Shared by the web app and Cloud Functions. Members and admins only ever see it called "AI": the
 * provider and the model never appear in the app, its messages or its errors.
 */
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"

export interface AiConfig {
  apiKey: string
  /** Only for the stand-in server in development and tests (scripts/fake-ai.ts). */
  baseUrl: string | null
  /** Only for unit tests. */
  fetch?: typeof fetch
}

/** Why the AI could not do a job, in words an admin can act on. */
export class AiError extends Error {
  constructor(
    message: string,
    /** True when trying again later may work. */
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

const MODEL = "claude-opus-5-5"
/** Requests are capped at 32 MB and base64 adds a third. */
export const MAX_PDF_BYTES = 24 * 1024 * 1024

export type AiDocument = { kind: "pdf"; name: string; data: Uint8Array } | { kind: "text"; name: string; text: string }

function documentBlock(doc: AiDocument): Anthropic.Beta.BetaContentBlockParam {
  if (doc.kind === "pdf") {
    if (doc.data.byteLength > MAX_PDF_BYTES)
      throw new AiError("This PDF is larger than 24 MB. Export a smaller copy and try again.", false)
    return {
      type: "document",
      title: doc.name,
      source: { type: "base64", media_type: "application/pdf", data: Buffer.from(doc.data).toString("base64") },
    }
  }
  if (doc.text.trim().length < 200) throw new AiError("This file has too little text to work from.", false)
  return { type: "document", title: doc.name, source: { type: "text", media_type: "text/plain", data: doc.text } }
}

/** One request with a JSON answer checked against `schema`. Every failure becomes an AiError. */
async function ask<T>(
  config: AiConfig,
  schema: z.ZodType<T>,
  request: {
    system: string
    content: Anthropic.Beta.BetaContentBlockParam[]
    effort: "medium" | "high"
    maxTokens: number
    /** What to tell the admin when the AI cannot read what it was sent. */
    unreadable: string
  },
): Promise<T> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
    maxRetries: config.fetch ? 0 : 2,
    timeout: 8 * 60 * 1000,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  })
  let response
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: request.maxTokens,
      // When a safety check declines a request, another model takes it over.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: request.effort, format: betaZodOutputFormat(schema) },
      system: request.system,
      messages: [{ role: "user", content: request.content }],
    })
  } catch (error) {
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof Anthropic.InternalServerError ||
      error instanceof Anthropic.APIConnectionError
    )
      throw new AiError("The AI is busy right now. Try again in a few minutes.", true)
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
      throw new AiError("The AI is not set up correctly. Check the AI key in the server settings.", false)
    if (error instanceof Anthropic.BadRequestError) throw new AiError(request.unreadable, false)
    throw new AiError("The AI could not finish. Try again.", true)
  }
  if (response.stop_reason === "refusal") throw new AiError("The AI declined this document.", false)
  if (response.stop_reason === "max_tokens")
    throw new AiError("The AI ran out of room. Ask for fewer questions at a time.", true)
  if (!response.parsed_output) throw new AiError("The AI's answer could not be read. Try again.", true)
  return response.parsed_output
}

// ---- Quiz questions -----------------------------------------------------------------------------

const generatedQuestionSchema = z.object({
  prompt: z.string().describe("The question, one or two sentences"),
  correct: z.string().describe("The correct answer"),
  wrong: z.array(z.string()).describe("Exactly three plausible wrong answers"),
  explanation: z.string().describe("Why the correct answer is right, in one or two sentences"),
})
const questionBankSchema = z.object({ questions: z.array(generatedQuestionSchema) })

export interface GeneratedQuestion {
  prompt: string
  choices: string[]
  answer: number
  explanation: string
}

const QUIZ_SYSTEM = `You write quiz questions for HG Profit Options, an options trading class taught by Hubert "HG" Gaffney. Members use them to check what they learned from the class documents.

Write multiple-choice questions from the document you are given:
- Test understanding of the ideas, rules and numbers the document teaches, not trivia such as titles or dates.
- Each question has one correct answer and three wrong answers that would tempt someone who only skimmed the material.
- The explanation says why the correct answer is right, in the document's own terms.
- Use only what the document says. When it is too short for the number asked, write fewer questions.
- Plain, friendly English. This is education: never tell anyone what to trade.`

/**
 * Writes up to `count` questions from a document. Choices come back shuffled, so the correct answer is
 * not always in the same place. `avoid` lists questions the quiz already has.
 */
export async function writeQuizQuestions(
  config: AiConfig,
  doc: AiDocument,
  options: { count: number; avoid: readonly string[]; random?: () => number },
): Promise<GeneratedQuestion[]> {
  const avoid =
    options.avoid.length > 0
      ? `\n\nThe quiz already has these questions; write different ones:\n${options.avoid.map((q) => `- ${q}`).join("\n")}`
      : ""
  const bank = await ask(config, questionBankSchema, {
    system: QUIZ_SYSTEM,
    content: [
      documentBlock(doc),
      { type: "text", text: `Write ${options.count} questions from this document.${avoid}` },
    ],
    effort: "high",
    maxTokens: 16000,
    unreadable: "The AI could not read this. Try a PDF or Word file under 24 MB.",
  })
  const random = options.random ?? Math.random
  return bank.questions
    .map((q) => ({
      prompt: q.prompt.trim(),
      correct: q.correct.trim(),
      wrong: [...new Set(q.wrong.map((w) => w.trim()))].filter((w) => w !== "" && w !== q.correct.trim()),
      explanation: q.explanation.trim(),
    }))
    .filter((q) => q.prompt !== "" && q.correct !== "" && q.wrong.length >= 3)
    .slice(0, options.count)
    .map((q) => {
      const choices = [q.correct, ...q.wrong.slice(0, 3)]
      // Fisher-Yates, then find where the correct answer landed.
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[choices[i], choices[j]] = [choices[j] as string, choices[i] as string]
      }
      return { prompt: q.prompt, choices, answer: choices.indexOf(q.correct), explanation: q.explanation }
    })
}

// ---- Class summaries ----------------------------------------------------------------------------

export const classSummarySchema = z.object({
  overview: z.string().describe("Two or three sentences on what the class covered"),
  keyPoints: z.array(z.string()).describe("The lessons, rules and market views taught, one sentence each"),
  tickers: z
    .array(z.object({ symbol: z.string(), note: z.string() }))
    .describe("Each stock or ETF discussed, with what was said about it"),
  actionItems: z.array(z.string()).describe("What members were asked to do before the next class"),
  questions: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe("Questions members asked and the answers given"),
})
export type ClassSummary = z.infer<typeof classSummarySchema>

const SUMMARY_SYSTEM = `You summarize the live classes of HG Profit Options, an options trading class taught by Hubert "HG" Gaffney, for members who missed a class or want to review it. You get the class transcript, made by speech recognition, so names and tickers may be misspelled; use the class's ticker list to read them.

- Key points: the lessons, rules and market views taught, in the order discussed.
- Tickers: only those actually discussed, by symbol, with the levels, setups or targets mentioned.
- Action items and questions: leave the list empty when the class had none.

Report what was said in class in plain English; do not add trading advice of your own.`

/** Summarizes a class from its transcript: text (cleaned up by transcriptText) or a PDF. */
export async function summarizeClass(
  config: AiConfig,
  input: { title: string; date: string; transcript: AiDocument; tickers: readonly string[] },
): Promise<ClassSummary> {
  const summary = await ask(config, classSummarySchema, {
    system: SUMMARY_SYSTEM,
    content: [
      { type: "text", text: `Tickers the class follows: ${input.tickers.join(", ")}` },
      documentBlock({ ...input.transcript, name: `${input.title}, ${input.date}` }),
      { type: "text", text: "Summarize this class." },
    ],
    effort: "medium",
    maxTokens: 16000,
    unreadable: "The AI could not read this transcript. Upload it as a text, Word or PDF file and try again.",
  })
  const clean = (list: string[]) => list.map((item) => item.trim()).filter((item) => item !== "")
  return {
    overview: summary.overview.trim(),
    keyPoints: clean(summary.keyPoints),
    tickers: summary.tickers
      .map((t) => ({ symbol: t.symbol.trim().toUpperCase(), note: t.note.trim() }))
      .filter((t) => t.symbol !== ""),
    actionItems: clean(summary.actionItems),
    questions: summary.questions
      .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }))
      .filter((q) => q.question !== ""),
  }
}
