import { z } from "zod";

export const submitRoundParams = z.object({
  game: z.string().min(1).max(32),
  index: z.string().regex(/^\d{1,2}$/),
});

/** The submission is checked by the game's own engine, so it is only size-limited here. */
export const submitRoundBody = z.object({
  submission: z.unknown().refine((value) => JSON.stringify(value ?? null).length <= 60_000, "Submission is too large"),
});
