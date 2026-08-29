/** Offset-pagination helpers shared by every list endpoint. Kept here rather
 *  than in a feature so the "empty result is still one page" rule below has a
 *  single definition. */

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
