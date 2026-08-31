export type VoteValue = 1 | -1;

export type VoteTarget =
  | { type: "question"; id: string }
  | { type: "answer"; id: string };

/** What the API returns after any vote or retraction: where the target's score
 *  landed, and what this user's vote now is (null once retracted). */
export type VoteResult = {
  score: number;
  userVote: VoteValue | null;
};

/** The three numbers a single vote transition moves. Every one is a difference
 *  between what the new state is worth and what the old state was worth, so a
 *  switch and a retract need no special cases. */
export type VoteEffect = {
  scoreDelta: number;
  authorReputationDelta: number;
  voterReputationDelta: number;
};

/** Reputation moves, following the Stack Overflow model. */
export const REPUTATION = {
  /** An upvote on an answer is worth more than one on a question. */
  UPVOTED_ANSWER: 10,
  UPVOTED_QUESTION: 5,
  /** A downvote costs the author, whichever kind of post it is. */
  DOWNVOTED: -2,
  /** Casting a downvote on an answer costs the voter a little too — pushing
   *  someone else's work down is not free. Question downvotes are free. */
  DOWNVOTE_ON_ANSWER_CASTS: -1,
} as const;

/** A user may not vote on their own question or answer. */
export function canVote(targetAuthorId: number, voterId: number): boolean {
  return targetAuthorId !== voterId;
}

/** The one place that knows which of the two foreign-key columns a target kind
 *  lives in — every query and insert goes through here. */
export function toTargetColumn(
  target: VoteTarget,
): { questionId: string } | { answerId: string } {
  return target.type === "question" ? { questionId: target.id } : { answerId: target.id };
}

/**
 * The arithmetic of a vote changing from `previous` to `next` — either may be
 * null, meaning "no vote". The score bump and both reputation bumps are each a
 * subtraction: value of the new state minus value of the old state.
 */
export function computeVoteEffect(
  targetType: VoteTarget["type"],
  previous: VoteValue | null,
  next: VoteValue | null,
): VoteEffect {
  return {
    scoreDelta: scoreContribution(next) - scoreContribution(previous),
    authorReputationDelta:
      authorReward(targetType, next) - authorReward(targetType, previous),
    voterReputationDelta:
      voterCost(targetType, next) - voterCost(targetType, previous),
  };
}

function scoreContribution(value: VoteValue | null): number {
  return value ?? 0;
}

function authorReward(targetType: VoteTarget["type"], value: VoteValue | null): number {
  if (value === 1) {
    return targetType === "answer" ? REPUTATION.UPVOTED_ANSWER : REPUTATION.UPVOTED_QUESTION;
  }
  if (value === -1) {
    return REPUTATION.DOWNVOTED;
  }
  return 0;
}

function voterCost(targetType: VoteTarget["type"], value: VoteValue | null): number {
  return value === -1 && targetType === "answer" ? REPUTATION.DOWNVOTE_ON_ANSWER_CASTS : 0;
}
