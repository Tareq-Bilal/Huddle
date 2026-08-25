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
  id: number;
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

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PagedQuestions = {
  questions: QuestionSummary[];
  meta: PageMeta;
};

/** Offset pagination is 1-indexed for humans and 0-indexed for the database. */
export function toSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function toPageMeta(total: number, page: number, limit: number): PageMeta {
  return {
    page,
    limit,
    total,
    // An empty result set is one empty page, not zero pages — otherwise a
    // client rendering "page 1 of 0" has to special-case it.
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
