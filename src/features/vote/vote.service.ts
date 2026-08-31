import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import type { VoteEffect, VoteResult, VoteTarget, VoteValue } from "./vote.model.ts";
import { canVote, computeVoteEffect, toTargetColumn } from "./vote.model.ts";

/** The shared client, or a throwaway one an integration test points at a scratch
 *  database. The public functions always use the default. */
type Db = typeof prisma;

type VotePersist = {
  userId: number;
  target: VoteTarget;
  targetAuthorId: number;
  previous: VoteValue | null;
  next: VoteValue | null;
  effect: VoteEffect;
};

/**
 * Casts or changes a vote. A first vote inserts, changing direction updates, and
 * re-casting the same direction is a conflict — nothing to do, and the client's
 * state already matches what it asked for.
 *
 * You cannot vote on your own post, and the target must exist. Everything past
 * those checks — the vote row, the score, both reputations — moves inside one
 * transaction.
 */
export async function castVote(
  target: VoteTarget,
  value: VoteValue,
  userId: number,
): Promise<VoteResult> {
  const targetAuthorId = await getTargetAuthorId(target);

  if (targetAuthorId === null) {
    throw new NotFoundError(`No ${target.type} found with id ${target.id}`);
  }

  if (!canVote(targetAuthorId, userId)) {
    throw new ForbiddenError(`You cannot vote on your own ${target.type}`);
  }

  const previous = await getUserVoteValue(userId, target);

  if (previous === value) {
    throw new ConflictError("You have already cast this vote");
  }

  const effect = computeVoteEffect(target.type, previous, value);
  const { score } = await persistVote({
    userId,
    target,
    targetAuthorId,
    previous,
    next: value,
    effect,
  });

  return { score, userVote: value };
}

/** Removes this user's vote from the target, undoing its score and reputation
 *  effects. Having no vote to remove is a 404, not a silent success. */
export async function retractVote(target: VoteTarget, userId: number): Promise<VoteResult> {
  const targetAuthorId = await getTargetAuthorId(target);

  if (targetAuthorId === null) {
    throw new NotFoundError(`No ${target.type} found with id ${target.id}`);
  }

  const previous = await getUserVoteValue(userId, target);

  if (previous === null) {
    throw new NotFoundError(`You have not voted on this ${target.type}`);
  }

  const effect = computeVoteEffect(target.type, previous, null);
  const { score } = await persistVote({
    userId,
    target,
    targetAuthorId,
    previous,
    next: null,
    effect,
  });

  return { score, userVote: null };
}

/** The author of the thing being voted on, or null if there is no such thing.
 *  Exported for the tests and the integration harness. */
export async function getTargetAuthorId(target: VoteTarget, db: Db = prisma): Promise<number | null> {
  const row =
    target.type === "question"
      ? await db.question.findUnique({ where: { id: target.id }, select: { authorId: true } })
      : await db.answer.findUnique({ where: { id: target.id }, select: { authorId: true } });

  return row?.authorId ?? null;
}

/** The direction of this user's existing vote on the target, or null if they
 *  have not voted on it. Exported for the tests and the integration harness. */
export async function getUserVoteValue(
  userId: number,
  target: VoteTarget,
  db: Db = prisma,
): Promise<VoteValue | null> {
  const vote = await db.vote.findUnique({
    where: voteWhere(userId, target),
    select: { value: true },
  });

  return vote ? (vote.value as VoteValue) : null;
}

/**
 * Applies the whole vote as one transaction: the vote row itself, the target's
 * score, the target author's reputation, and — for answer downvotes — the
 * voter's own reputation. Either every write lands or none does.
 *
 * When `previous` is null this INSERTs the vote row. Two first-votes racing here
 * both try to insert the same (userId, questionId) or (userId, answerId);
 * Postgres rejects the loser with P2002, which `translatePrismaError` turns into
 * a 409. The database settles the race, not a check-then-insert. Returns the
 * target's score after the change. Exported for the tests and the integration
 * harness.
 */
export function persistVote(persist: VotePersist, db: Db = prisma): Promise<{ score: number }> {
  const { userId, target, targetAuthorId, previous, next, effect } = persist;

  return db.$transaction(async (tx) => {
    if (previous === null) {
      await tx.vote.create({
        data: { userId, value: next as VoteValue, ...toTargetColumn(target) },
      });
    } else if (next === null) {
      await tx.vote.delete({ where: voteWhere(userId, target) });
    } else {
      await tx.vote.update({ where: voteWhere(userId, target), data: { value: next } });
    }

    const scored =
      target.type === "question"
        ? await tx.question.update({
            where: { id: target.id },
            data: { score: { increment: effect.scoreDelta } },
            select: { score: true },
          })
        : await tx.answer.update({
            where: { id: target.id },
            data: { score: { increment: effect.scoreDelta } },
            select: { score: true },
          });

    if (effect.authorReputationDelta !== 0) {
      await tx.user.update({
        where: { id: targetAuthorId },
        data: { reputation: { increment: effect.authorReputationDelta } },
      });
    }

    if (effect.voterReputationDelta !== 0) {
      await tx.user.update({
        where: { id: userId },
        data: { reputation: { increment: effect.voterReputationDelta } },
      });
    }

    return { score: scored.score };
  });
}

/** Prisma addresses a compound unique by a generated key name. Each target kind
 *  uses its own (userId, <column>) index; the other column is null and, because
 *  Postgres treats nulls as distinct, never collides. */
function voteWhere(userId: number, target: VoteTarget) {
  return target.type === "question"
    ? { userId_questionId: { userId, questionId: target.id } }
    : { userId_answerId: { userId, answerId: target.id } };
}
