/**
 * Turns a meeting transcript (Zoom's WebVTT, an SRT file or plain text) into readable lines: one line per
 * turn, "Speaker: what they said", with cue numbers and timestamps removed and a speaker's consecutive
 * cues joined.
 */
export function transcriptText(raw: string): string {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  const isCued = /^WEBVTT/.test(text) || /\d{2}:\d{2}[:.,]\d{2}[.,]\d{3}\s*-->/.test(text)
  if (!isCued) return text.trim()

  const turns: { speaker: string | null; words: string[] }[] = []
  for (const block of text.split(/\n{2,}/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "")
    const timing = lines.findIndex((l) => l.includes("-->"))
    if (timing === -1) continue
    const spoken = lines
      .slice(timing + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim()
    if (spoken === "") continue
    // Zoom writes the speaker before a colon; a voice tag (<v Name>) is handled by the tag strip above.
    const voice = /<v\s+([^>]+)>/.exec(lines.slice(timing + 1).join(" "))?.[1]?.trim() ?? null
    const match = /^([^:]{1,60}):\s+(.*)$/.exec(spoken)
    const speaker = voice ?? match?.[1]?.trim() ?? null
    const words = match && !voice ? (match[2] ?? "") : spoken
    const last = turns.at(-1)
    if (last && last.speaker === speaker) last.words.push(words)
    else turns.push({ speaker, words: [words] })
  }
  return turns.map((t) => (t.speaker ? `${t.speaker}: ${t.words.join(" ")}` : t.words.join(" "))).join("\n")
}
