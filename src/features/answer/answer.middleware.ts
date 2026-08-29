import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";

/**
 * Guards the answer write routes: only the author may edit or delete their own
 * answer. Feature-local — not re-exported from `index.ts`.
 *
 * Runs after `authenticate` and after the `:answerId` param is validated, so
 * `req.user` and a well-formed id are both guaranteed. A missing answer is a 404
 * and someone else's answer is a 403.
 */
export async function requireAnswerOwner(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { answerId } = req.params as { answerId: string };

    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      select: { authorId: true },
    });

    if (!answer) {
      throw new NotFoundError(`No answer found with id ${answerId}`);
    }

    if (answer.authorId !== req.user!.id) {
      throw new ForbiddenError("You can only modify your own answers");
    }

    next();
  } catch (error) {
    next(error);
  }
}
