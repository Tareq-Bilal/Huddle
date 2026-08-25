export type Tag = {
  id: number,
  name: string,
  slug: string,
  questionCount: number,
};

/** What autocomplete hands back. `name` is what the user sees — the pretty
 *  display form — while `slug` is what gets stored and linked. */
export type TagSuggestion = {
  name: string;
  slug: string;
  questionCount: number;
};

export function toTagSuggestion(tag: Tag): TagSuggestion {
  return { name: tag.name, slug: tag.slug, questionCount: tag.questionCount };
}

/** A tag can surface twice in one search — once by its own slug and once via a
 *  synonym pointing at it. The user should see it once. */
export function dedupeById(tags: Tag[]): Tag[] {
  const seen = new Map<number, Tag>();

  for (const tag of tags) {
    if (!seen.has(tag.id)) {
      seen.set(tag.id, tag);
    }
  }

  return [...seen.values()];
}

/** Most-used first: the count is the signal that tells a user which of two
 *  lookalike tags is the real one. */
export function rankByPopularity(tags: Tag[], limit: number): Tag[] {
  return [...tags].sort((a, b) => b.questionCount - a.questionCount).slice(0, limit);
}

/**
 * Derives a tag's URL key from its display name.
 *
 * `+` and `#` are spelled out instead of stripped: "C++", "C#", and "C" would
 * otherwise all collapse to the same slug and collide on the unique constraint.
 *
 * Running it on an already-slugified string returns the same value, so callers
 * never have to track whether a name has been through it before.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/#/g, "-sharp")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}