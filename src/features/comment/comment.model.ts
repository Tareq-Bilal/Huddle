import type { PageMeta } from "../../shared/pagination.ts";

export type CommentAuthor = {
  id: number;
  name: string;
};

/**
 * What a comment hangs off. A discriminated union rather than two nullable ids,
 * so "exactly one target" is true by construction in the code the same way the
 * CHECK constraint makes it true in the database.
 */
export type CommentTarget =
  | { type: "question"; id: string }
  | { type: "answer"; id: string };

/** Comments have no derived fields, so the stored row is already the response —
 *  the service selects exactly this shape and needs no mapper. */
export type CommentResponse = {
  id: string;
  body: string;
  createdAt: Date;
  questionId: string | null;
  answerId: string | null;
  author: CommentAuthor;
};

export type PagedComments = {
  comments: CommentResponse[];
  meta: PageMeta;
};

/**
 * Translates a target into the column that holds it. The single place that
 * knows which of the two foreign keys a kind of target lives in — every query
 * and insert goes through here rather than branching on `type` itself.
 */
export function toTargetColumn(
  target: CommentTarget,
): { questionId: string } | { answerId: string } {
  return target.type === "question" ? { questionId: target.id } : { answerId: target.id };
}
