import type { PageMeta } from "../../shared/pagination.ts";

export type AnswerAuthor = {
  id: number;
  name: string;
};

/** The stored columns of an answer, as the service selects them from Prisma.
 *  `isAccepted` is not here because it is not stored — it is derived from the
 *  parent question's `acceptedAnswerId`. */
export type AnswerRow = {
  id: string;
  body: string;
  score: number;
  createdAt: Date;
  author: AnswerAuthor;
  questionId: string;
};

export type AnswerResponse = AnswerRow & {
  isAccepted: boolean;
};

export type PagedAnswers = {
  answers: AnswerResponse[];
  meta: PageMeta;
};

/** Only the question's author may accept an answer. */
export function canAcceptAnswer(questionAuthorId: number, userId: number): boolean {
  return questionAuthorId === userId;
}

/** Adds the derived `isAccepted` flag. `acceptedAnswerId` is the parent
 *  question's pointer — `null` when nothing is accepted yet. */
export function toAnswerResponse(
  row: AnswerRow,
  acceptedAnswerId: string | null,
): AnswerResponse {
  return { ...row, isAccepted: row.id === acceptedAnswerId };
}
