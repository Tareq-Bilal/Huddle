import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";

/**
 * Guards the comment write routes: only the author may edit or delete their own
 * comment. Feature-local — not re-exported from `index.ts`.
 *
 * Runs after `authenticate` and after the `:commentId` param is validated, so
 * `req.user` and a well-formed id are both guaranteed. A missing comment is a
 * 404 and someone else's comment is a 403.
 */
export async function requireCommentOwner(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { commentId } = req.params as { commentId: string };

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });

    if (!comment) {
      throw new NotFoundError(`No comment found with id ${commentId}`);
    }

    if (comment.authorId !== req.user!.id) {
      throw new ForbiddenError("You can only modify your own comments");
    }

    next();
  } catch (error) {
    next(error);
  }
}
