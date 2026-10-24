import type { Role } from "./domain/types"

/**
 * Trader levels. Everyone starts as a beginner; passing the exam makes a beginner intermediate, and HG
 * moves traders up to advanced. Admins and data editors are a role on top of a level.
 */
export const TRADER_LEVELS = ["beginner", "intermediate", "advanced"] as const
export type TraderLevel = (typeof TRADER_LEVELS)[number]

export const LEVEL_LABELS: Record<TraderLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

/** What the levels are about, the same at every level. */
export const LEVELS_INTRO =
  "Levels are about how much guidance you get, not how much you are taught. Education never stops, at any level."

/** What each level means, and how to move on from it. Members and admins read the same words. */
export const LEVEL_GUIDE: Record<TraderLevel, { means: string; next: string | null }> = {
  beginner: {
    means: "Fully guided. HG works through each trade with you, from the first idea all the way to the exit.",
    next: "Pass the exam with 80% or more and you move up to Intermediate right away.",
  },
  intermediate: {
    means:
      "You passed the exam. You are not on your own: HG brings you along step by step, with less hand-holding and just as much teaching.",
    next: "HG moves traders up to Advanced when they are ready.",
  },
  advanced: {
    means:
      "HG's advanced team: the least oversight and even more teaching. Advanced traders also answer questions in Chat.",
    next: null,
  },
}

export const levelRank = (level: TraderLevel): number => TRADER_LEVELS.indexOf(level)

/** Whether a person may open something that is open from `from` up; admins and data editors always may. */
export function reachesLevel(person: { role: Role; level: TraderLevel }, from: TraderLevel): boolean {
  return person.role !== "member" || levelRank(person.level) >= levelRank(from)
}

/** Advanced traders and admins answer questions in Chat and see every thread. */
export function answersQuestions(person: { role: Role; level: TraderLevel }): boolean {
  return person.role === "admin" || person.level === "advanced"
}

/** The level after passing a test that awards `awards`: a pass only ever raises a level. */
export function levelAfterPass(current: TraderLevel, awards: TraderLevel): TraderLevel {
  return levelRank(awards) > levelRank(current) ? awards : current
}

/** "Admin", "Data editor", or the trader level, as a badge label next to a person's name. */
export function personBadge(person: { role: Role; level: TraderLevel }): string {
  return person.role === "admin" ? "Admin" : person.role === "editor" ? "Data editor" : LEVEL_LABELS[person.level]
}
