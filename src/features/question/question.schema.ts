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

export const listQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const questionIdParamSchema = z.object({
  id: z.coerce.number().int().positive("Question id must be a positive integer"),
});

export type CreateQuestionDto = z.infer<typeof createQuestionSchema>;
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
export type QuestionIdParam = z.infer<typeof questionIdParamSchema>;
