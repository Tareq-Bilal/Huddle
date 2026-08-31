import { z } from "zod";

/** A vote is a direction: up (+1) or down (-1). Anything else is a client bug. */
export const castVoteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

/** Both POST /votes/questions/:id and POST /votes/answers/:id take the same
 *  shape of id — the path is what says which kind of thing it is. */
export const voteTargetParamSchema = z.object({
  id: z.uuid("Target id must be a valid UUID"),
});

export type CastVoteDto = z.infer<typeof castVoteSchema>;
export type VoteTargetParam = z.infer<typeof voteTargetParamSchema>;
