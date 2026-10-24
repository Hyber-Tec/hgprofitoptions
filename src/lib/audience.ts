import { z } from "zod"
import { TRADER_LEVELS } from "@/core/levels"
import { isDocId } from "@/server/model"

/** Who an admin sends something to: every member, members at some levels, or chosen people. */
export const audienceInput = z.discriminatedUnion("to", [
  z.object({ to: z.literal("everyone") }),
  z.object({ to: z.literal("levels"), levels: z.array(z.enum(TRADER_LEVELS)).min(1, "Pick at least one level") }),
  z.object({
    to: z.literal("members"),
    uids: z.array(z.string().refine(isDocId)).min(1, "Pick at least one member").max(1000),
  }),
])
