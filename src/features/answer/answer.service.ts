import { ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import { toPageMeta, toSkip } from "../../shared/pagination.ts";
import type { AnswerResponse, PagedAnswers } from "./answer.model.ts";
import { canAcceptAnswer, toAnswerResponse } from "./answer.model.ts";
import type { CreateAnswerDto, ListAnswersQuery, UpdateAnswerDto } from "./answer.schema.ts";

/** Exactly the columns `AnswerRow` describes, so what Prisma returns feeds
 *  straight into `toAnswerResponse` with no mapping in between. */
const ANSWER_SELECT = {
  id: true,
  body: true,
  score: true,
  createdAt: true,
  questionId: true,
  author: { select: { id: true, name: true } },
} as const;

/** Posts an answer to a question. A fresh answer is never the accepted one. */
export async function createAnswer(
  questionId: string,
  input: CreateAnswerDto,
  authorId: number,
): Promise<AnswerResponse> {
  await requireQuestionExists(questionId);

  const answer = await prisma.answer.create({
    data: { body: input.body, authorId, questionId },
    select: ANSWER_SELECT,
  });

  return toAnswerResponse(answer, null);
}

export async function listAnswersByQuestion(
  questionId: string,
  query: ListAnswersQuery,
): Promise<PagedAnswers> {
  const { page, limit } = query;

  // The question tells us which answer is accepted; its answers and their count
  // are independent of that and of each other, so all three go out together.
  const [question, answers, total] = await Promise.all([
    prisma.question.findUnique({
      where: { id: questionId },
      select: { acceptedAnswerId: true },
    }),
    prisma.answer.findMany({
      where: { questionId },
      select: ANSWER_SELECT,
      orderBy: { createdAt: "asc" },
      skip: toSkip(page, limit),
      take: limit,
    }),
    prisma.answer.count({ where: { questionId } }),
  ]);

  if (!question) {
    throw new NotFoundError(`No question found with id ${questionId}`);
  }

  return {
    answers: answers.map((answer) => toAnswerResponse(answer, question.acceptedAnswerId)),
    meta: toPageMeta(total, page, limit),
  };
}

/**
 * Marks an answer accepted. Only the question's author may do this. Re-accepting
 * a different answer just overwrites the pointer — there is only ever one, which
 * the `@unique` on `acceptedAnswerId` guarantees.
 */
export async function acceptAnswer(answerId: string, userId: number): Promise<AnswerResponse> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    select: { ...ANSWER_SELECT, question: { select: { authorId: true } } },
  });

  if (!answer) {
    throw new NotFoundError(`No answer found with id ${answerId}`);
  }

  if (!canAcceptAnswer(answer.question.authorId, userId)) {
    throw new ForbiddenError("Only the question's author can accept an answer");
  }

  await prisma.question.update({
    where: { id: answer.questionId },
    data: { acceptedAnswerId: answerId },
  });

  return toAnswerResponse(stripQuestion(answer), answerId);
}

/** Edits an answer's body. Ownership is enforced by `requireAnswerOwner` on the
 *  route, so this only needs the id and the new text. */
export async function updateAnswer(
  answerId: string,
  input: UpdateAnswerDto,
): Promise<AnswerResponse> {
  const answer = await prisma.answer.update({
    where: { id: answerId },
    data: { body: input.body },
    select: { ...ANSWER_SELECT, question: { select: { acceptedAnswerId: true } } },
  });

  return toAnswerResponse(stripQuestion(answer), answer.question.acceptedAnswerId);
}

/** Deletes an answer. If it was the accepted one, the `SetNull` foreign key
 *  clears the question's pointer on its own. */
export async function deleteAnswer(answerId: string): Promise<void> {
  await prisma.answer.delete({ where: { id: answerId } });
}

async function requireQuestionExists(questionId: string): Promise<void> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true },
  });

  if (!question) {
    throw new NotFoundError(`No question found with id ${questionId}`);
  }
}

/** Drops the joined `question` relation so the row matches `AnswerRow`. */
function stripQuestion<T extends { question: unknown }>(answer: T): Omit<T, "question"> {
  const { question: _question, ...rest } = answer;
  return rest;
}
