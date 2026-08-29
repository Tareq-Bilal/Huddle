import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";

/**
 * Guards the question write routes: only the author may edit or delete their own
 * question. Feature-local because no other feature needs it, so it is not
 * re-exported from `index.ts`.
 *
 * Runs after `authenticate` and after the `:id` param has been validated, so
 * `req.user` and a well-formed `req.params.id` are both guaranteed here.
 *
 * A missing question is a 404 and a question owned by someone else is a 403 —
 * questions are public to read, so the 403 gives nothing away.
 */
export async function requireQuestionOwner(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };

    const question = await prisma.question.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!question) {
      throw new NotFoundError(`No question found with id ${id}`);
    }

    if (question.authorId !== req.user!.id) {
      throw new ForbiddenError("You can only modify your own questions");
    }

    next();
  } catch (error) {
    next(error);
  }
}
