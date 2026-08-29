import { z } from "zod";

/** Length floors are a quality gate, not a technical limit: a one-word title or
 *  a two-word body is almost never an answerable question. */
export const createQuestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(15, "Title must be at least 15 characters")
    .max(150, "Title must be at most 150 characters"),

  body: z.string().trim().min(30, "Body must be at least 30 characters"),

  /** Tag *names*, not slugs — the client sends what the user picked or typed,
   *  and the tag feature normalises and resolves them. */
  tags: z
    .array(z.string().trim().min(1, "A tag cannot be empty"))
    .min(1, "At least one tag is required")
    .max(5, "At most 5 tags are allowed"),
});

/** Every field is optional on update, but the request must change *something* —
 *  an empty patch is a client bug, not a no-op worth a 200. When `tags` is
 *  present it still has to satisfy the same 1..5 rule as on create. */
export const updateQuestionSchema = createQuestionSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const listQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Accepts any well-formed UUID rather than v7 specifically — the format is
 *  what needs guarding, and an id that is valid but unknown simply 404s. */
export const questionIdParamSchema = z.object({
  id: z.uuid("Question id must be a valid UUID"),
});

export type CreateQuestionDto = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionDto = z.infer<typeof updateQuestionSchema>;
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
export type QuestionIdParam = z.infer<typeof questionIdParamSchema>;
