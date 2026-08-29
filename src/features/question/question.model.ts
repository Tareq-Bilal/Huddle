import type { PageMeta } from "../../shared/pagination.ts";

export type QuestionAuthor = {
  id: number;
  name: string;
};

export type QuestionTag = {
  name: string;
  slug: string;
};

/** What a question looks like in a list — everything except the body, which is
 *  the expensive field and the one nobody reads from an index page. */
export type QuestionSummary = {
  id: string;
  title: string;
  score: number;
  viewCount: number;
  createdAt: Date;
  author: QuestionAuthor;
  tags: QuestionTag[];
};

export type QuestionDetail = QuestionSummary & {
  body: string;
};

export type PagedQuestions = {
  questions: QuestionSummary[];
  meta: PageMeta;
};

/**
 * Given a question's current tag ids and the set it should end up with, returns
 * which ids were added and which were removed. The caller uses this to move each
 * tag's denormalised `questionCount` by the right amount — tags present in both
 * sets are untouched.
 */
export function diffTagIds(
  current: number[],
  next: number[],
): { added: number[]; removed: number[] } {
  const currentSet = new Set(current);
  const nextSet = new Set(next);

  return {
    added: next.filter((id) => !currentSet.has(id)),
    removed: current.filter((id) => !nextSet.has(id)),
  };
}
