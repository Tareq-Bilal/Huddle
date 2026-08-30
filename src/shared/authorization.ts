import { ForbiddenError, NotFoundError } from "./errors/app-error.ts";

/**
 * Any Prisma model whose rows carry an author. Described structurally rather
 * than by importing Question, Answer, and Comment, so this file stays unaware of
 * which features exist and a new authored feature needs no change here.
 */
type AuthoredDelegate = {
  findUnique(args: {
    where: { id: string };
    select: { authorId: true };
  }): Promise<{ authorId: number } | null>;
};

/**
 * The ownership rule, for callers that already hold the row: only the author of
 * a piece of content may change it.
 *
 * `resource` is the singular noun for the thing being guarded ("question"),
 * used to build a message that names what was refused.
 */
export function requireAuthor(authorId: number, userId: number, resource: string): void {
  if (authorId !== userId) {
    throw new ForbiddenError(`You can only modify your own ${resource}s`);
  }
}

/**
 * Same rule, for callers that do not have the row yet — reads the one column the
 * decision needs and applies `requireAuthor` to it.
 *
 * A record that is not there is a 404 and someone else's record is a 403; content
 * here is public to read, so the 403 gives nothing away.
 */
export async function requireOwner(
  delegate: AuthoredDelegate,
  id: string,
  userId: number,
  resource: string,
): Promise<void> {
  const record = await delegate.findUnique({ where: { id }, select: { authorId: true } });

  if (!record) {
    throw new NotFoundError(`No ${resource} found with id ${id}`);
  }

  requireAuthor(record.authorId, userId, resource);
}
