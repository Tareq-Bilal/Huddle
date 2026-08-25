import { NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import { findOrCreateByNames } from "../tag/index.ts";
import type { PagedQuestions, QuestionDetail } from "./question.model.ts";
import { toPageMeta, toSkip } from "./question.model.ts";
import type { CreateQuestionDto, ListQuestionsQuery } from "./question.schema.ts";

/** Selecting exactly the DTO shape means no mapper is needed — what Prisma
 *  returns is already what the API exposes. */
const SUMMARY_FIELDS = {
  id: true,
  title: true,
  score: true,
  viewCount: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
  tags: { select: { name: true, slug: true } },
} as const;

const DETAIL_FIELDS = { ...SUMMARY_FIELDS, body: true } as const;

/**
 * Posts a question and attaches its tags.
 *
 * Tags are resolved *before* the transaction opens, deliberately. Tag creation
 * recovers from a unique-constraint collision by re-reading the winning row,
 * and in Postgres a constraint violation aborts the surrounding transaction —
 * the recovery query would run against a poisoned transaction and fail. Doing
 * it outside costs one thing: if the insert below fails, a tag may have been
 * created with no question on it. A tag with a count of zero is harmless.
 */
export async function createQuestion(
  input: CreateQuestionDto,
  authorId: number,
): Promise<QuestionDetail> {
  const tags = await findOrCreateByNames(input.tags, authorId);
  const tagIds = tags.map((tag) => tag.id);

  return prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        title: input.title,
        body: input.body,
        authorId,
        tags: { connect: tagIds.map((id) => ({ id })) },
      },
      select: DETAIL_FIELDS,
    });

    // questionCount is denormalised onto the tag so autocomplete can rank by
    // popularity without counting join rows on every keystroke. It moves in the
    // same transaction as the question, so the two can never disagree.
    await tx.tag.updateMany({
      where: { id: { in: tagIds } },
      data: { questionCount: { increment: 1 } },
    });

    return question;
  });
}

export async function listQuestions(query: ListQuestionsQuery): Promise<PagedQuestions> {
  const { page, limit } = query;

  // The count is needed for totalPages and is independent of the page itself,
  // so the two queries go out together rather than one after the other.
  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      select: SUMMARY_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: toSkip(page, limit),
      take: limit,
    }),
    prisma.question.count(),
  ]);

  return { questions, meta: toPageMeta(total, page, limit) };
}

export async function getQuestionById(id: string): Promise<QuestionDetail> {
  const question = await prisma.question.findUnique({ where: { id }, select: DETAIL_FIELDS });

  if (!question) {
    throw new NotFoundError(`No question found with id ${id}`);
  }

  return question;
}
