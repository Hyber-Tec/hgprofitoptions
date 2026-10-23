import type { Role } from "./domain/types"

/** Trader levels. Everyone starts as a beginner; admins are a role on top of a level. */
export const TRADER_LEVELS = ["beginner", "advanced", "expert"] as const
export type TraderLevel = (typeof TRADER_LEVELS)[number]

export const LEVEL_LABELS: Record<TraderLevel, string> = {
  beginner: "Beginner",
  advanced: "Advanced",
  expert: "Expert",
}

/** Experts and admins answer questions in Chat and see every thread. */
export function answersQuestions(person: { role: Role; level: TraderLevel }): boolean {
  return person.role === "admin" || person.level === "expert"
}

/** The level after passing a test that awards `awards`: a pass only ever raises a level. */
export function levelAfterPass(current: TraderLevel, awards: TraderLevel): TraderLevel {
  return TRADER_LEVELS.indexOf(awards) > TRADER_LEVELS.indexOf(current) ? awards : current
}

/** "Admin", or the trader level, as a badge label next to a person's name. */
export function personBadge(person: { role: Role; level: TraderLevel }): string {
  return person.role === "admin" ? "Admin" : LEVEL_LABELS[person.level]
}
