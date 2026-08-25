import zod from "zod";

/** Only the display name is accepted — the slug is derived from it by
 *  `slugify` in tag.model.ts, so a client cannot submit a slug that disagrees
 *  with the name it belongs to. */
export const createTagSchema = zod.object({
  name: zod
    .string()
    .trim()
    .min(1, "Name is required")
    .max(50, "Name must be at most 50 characters")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9+#.\- ]*$/,
      "Name must start with a letter or number, and may only contain letters, numbers, spaces, and + # . -",
    ),
});

/** Guards `GET /tags/:slug/questions` so a malformed slug is rejected before
 *  it reaches the database. */
export const tagSlugParamSchema = zod.object({
  slug: zod
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug must be at most 50 characters")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Slug must be lowercase, hyphen-separated words (e.g. \"rest-api\")",
    ),
});

/** Autocomplete query. `q` is raw user typing, so it is deliberately loose —
 *  it gets slugified before it ever reaches the database. Omitting `q` lists
 *  the most-used tags instead of searching. */
export const searchTagsQuerySchema = zod.object({
  q: zod.string().max(50, "Query must be at most 50 characters").optional(),
  limit: zod.coerce.number().int().min(1).max(50).default(10),
});

export type CreateTagDto = zod.infer<typeof createTagSchema>;
export type TagSlugParam = zod.infer<typeof tagSlugParamSchema>;
export type SearchTagsQuery = zod.infer<typeof searchTagsQuerySchema>;