import { NotFoundError } from "../../shared/errors/app-error.ts";
import { isForeignKeyViolation } from "../../shared/errors/prisma-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import { toPageMeta, toSkip } from "../../shared/pagination.ts";
import type { CommentResponse, CommentTarget, PagedComments } from "./comment.model.ts";
import { toTargetColumn } from "./comment.model.ts";
import type { CreateCommentDto, ListCommentsQuery, UpdateCommentDto } from "./comment.schema.ts";

/** Exactly the `CommentResponse` shape, so what Prisma returns is already what
 *  the API exposes. */
const COMMENT_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  questionId: true,
  answerId: true,
  author: { select: { id: true, name: true } },
} as const;

/**
 * Posts a comment on a question or an answer. Anyone logged in may comment —
 * there is no reputation gate and no approval step; a comment is visible the
 * moment it is written.
 *
 * The insert goes out without first checking the target exists. The foreign key
 * is what actually guarantees that, and asking first would cost a query on every
 * successful write while still leaving a window in which the target is deleted
 * between the check and the insert. Postgres already takes the right lock; all
 * this has to do is translate its refusal into a 404.
 */
export async function createComment(
  target: CommentTarget,
  input: CreateCommentDto,
  authorId: number,
): Promise<CommentResponse> {
  try {
    return await prisma.comment.create({
      data: { body: input.body, authorId, ...toTargetColumn(target) },
      select: COMMENT_SELECT,
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new NotFoundError(missingTargetMessage(target));
    }
    throw error;
  }
}

/** Oldest first: a comment thread reads as a conversation, so the order it was
 *  written in is the order it should be shown in. */
export async function listComments(
  target: CommentTarget,
  query: ListCommentsQuery,
): Promise<PagedComments> {
  const { page, limit } = query;
  const where = toTargetColumn(target);

  // Whether the target exists is independent of its comments and of their
  // count, so all three go out together.
  const [exists, comments, total] = await Promise.all([
    targetExists(target),
    prisma.comment.findMany({
      where,
      select: COMMENT_SELECT,
      orderBy: { createdAt: "asc" },
      skip: toSkip(page, limit),
      take: limit,
    }),
    prisma.comment.count({ where }),
  ]);

  if (!exists) {
    throw new NotFoundError(missingTargetMessage(target));
  }

  return { comments, meta: toPageMeta(total, page, limit) };
}

/** Ownership is enforced by `requireCommentOwner` on the route, so this only
 *  needs the id and the new text. */
export function updateComment(
  commentId: string,
  input: UpdateCommentDto,
): Promise<CommentResponse> {
  return prisma.comment.update({
    where: { id: commentId },
    data: { body: input.body },
    select: COMMENT_SELECT,
  });
}

export async function deleteComment(commentId: string): Promise<void> {
  await prisma.comment.delete({ where: { id: commentId } });
}

/** Reading has no foreign key to lean on: a missing question and a question
 *  with no comments both come back as an empty list, so the list path has to
 *  ask outright to tell a 404 from an empty page. */
async function targetExists(target: CommentTarget): Promise<boolean> {
  const row =
    target.type === "question"
      ? await prisma.question.findUnique({ where: { id: target.id }, select: { id: true } })
      : await prisma.answer.findUnique({ where: { id: target.id }, select: { id: true } });

  return row !== null;
}

function missingTargetMessage(target: CommentTarget): string {
  return `No ${target.type} found with id ${target.id}`;
}
