import { describe, expect, it } from "vitest"
import { AiError, summarizeClass, writeQuizQuestions, type AiConfig } from "./ai"

/** A fake AI endpoint that answers every request with `answer` (as the model's JSON text) and records it. */
function fakeAi(answer: unknown, options: { status?: number; stopReason?: string } = {}) {
  const requests: { url: string; body: Record<string, unknown> }[] = []
  const fetchImpl = ((input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>,
    })
    if (options.status && options.status >= 400)
      return Promise.resolve(
        new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "nope" } }), {
          status: options.status,
          headers: { "content-type": "application/json" },
        }),
      )
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "test",
          content: [{ type: "text", text: JSON.stringify(answer) }],
          stop_reason: options.stopReason ?? "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
  }) as typeof fetch
  const config: AiConfig = { apiKey: "test", baseUrl: "https://ai.example.com", fetch: fetchImpl }
  return { config, requests }
}

const lesson = {
  kind: "text" as const,
  name: "Channels.docx",
  text: "A channel is the normal moving range of a stock. ".repeat(10),
}

const question = (n: number) => ({
  prompt: `Question ${n}?`,
  correct: `Right ${n}`,
  wrong: [`Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
  explanation: `Because ${n}.`,
})

describe("quiz questions", () => {
  it("shuffles the choices and keeps track of the correct one", async () => {
    const { config, requests } = fakeAi({ questions: [question(1), question(2), question(3)] })
    let r = 0
    const random = () => [0.1, 0.9, 0.5, 0.3, 0.7][r++ % 5] ?? 0
    const questions = await writeQuizQuestions(config, lesson, { count: 3, avoid: ["Old question?"], random })
    expect(questions).toHaveLength(3)
    for (const [i, q] of questions.entries()) {
      expect(q.choices).toHaveLength(4)
      expect(q.choices[q.answer]).toBe(`Right ${i + 1}`)
      expect(new Set(q.choices).size).toBe(4)
    }
    expect(new Set(questions.map((q) => q.answer)).size).toBeGreaterThan(1)
    const body = requests[0]?.body ?? {}
    expect(body.model).toBe("claude-opus-5-5")
    expect(JSON.stringify(body.messages)).toContain("Old question?")
    expect(JSON.stringify(body.messages)).toContain("Write 3 questions")
  })

  it("drops questions without three distinct wrong answers", async () => {
    const broken = { ...question(2), wrong: ["Right 2", "Same", "Same"] }
    const { config } = fakeAi({ questions: [question(1), broken] })
    const questions = await writeQuizQuestions(config, lesson, { count: 5, avoid: [] })
    expect(questions.map((q) => q.prompt)).toEqual(["Question 1?"])
  })

  it("explains failures without naming the AI provider", async () => {
    const declined = fakeAi({ questions: [] }, { stopReason: "refusal" })
    await expect(writeQuizQuestions(declined.config, lesson, { count: 2, avoid: [] })).rejects.toThrow(
      "The AI declined this document.",
    )
    const unauthorized = fakeAi({}, { status: 401 })
    const error = await writeQuizQuestions(unauthorized.config, lesson, { count: 2, avoid: [] }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).message).toBe("The AI is not set up correctly. Check the AI key in the server settings.")
    expect((error as AiError).message).not.toMatch(/anthropic|claude/i)
  })

  it("refuses documents too short or too large before calling out", async () => {
    const { config, requests } = fakeAi({ questions: [] })
    await expect(
      writeQuizQuestions(config, { kind: "text", name: "x.txt", text: "Too short." }, { count: 2, avoid: [] }),
    ).rejects.toThrow("too little text")
    await expect(
      writeQuizQuestions(
        config,
        { kind: "pdf", name: "big.pdf", data: new Uint8Array(25 * 1024 * 1024) },
        { count: 2, avoid: [] },
      ),
    ).rejects.toThrow("larger than 24 MB")
    expect(requests).toHaveLength(0)
  })
})

describe("class summaries", () => {
  it("returns the summary with ticker symbols in capitals", async () => {
    const { config, requests } = fakeAi({
      overview: "We reviewed TSM.",
      keyPoints: ["Wait for the close."],
      tickers: [{ symbol: " tsm ", note: "Watching 465." }],
      actionItems: [],
      questions: [],
    })
    const summary = await summarizeClass(config, {
      title: "Saturday class",
      date: "Oct 24, 2026",
      transcript: {
        kind: "text",
        name: "transcript.vtt",
        text: "HG: Today we look at TSM and the 465 break. ".repeat(10),
      },
      tickers: ["TSM", "NVDA"],
    })
    expect(summary.tickers).toEqual([{ symbol: "TSM", note: "Watching 465." }])
    const sent = JSON.stringify(requests[0]?.body.messages)
    expect(sent).toContain("Tickers the class follows: TSM, NVDA")
    expect(sent).toContain('"title":"Saturday class, Oct 24, 2026"')
  })

  it("refuses a transcript too short to summarize", async () => {
    const { config, requests } = fakeAi({})
    await expect(
      summarizeClass(config, {
        title: "Saturday class",
        date: "Oct 24, 2026",
        transcript: { kind: "text", name: "t.txt", text: "HG: Hello." },
        tickers: [],
      }),
    ).rejects.toThrow("too little text")
    expect(requests).toHaveLength(0)
  })
})
