import { z } from "zod";

/** An answer is just prose. The 30-character floor is the same quality gate the
 *  question body uses — shorter than that is almost never a real answer. */
export const createAnswerSchema = z.object({
  body: z.string().trim().min(30, "Answer must be at least 30 characters"),
});

/** Update takes the same single field. Sending `{}` still fails because `body`
 *  is required — there is nothing else a patch could change. */
export const updateAnswerSchema = createAnswerSchema;

/** The question a new answer hangs off. Route param is `:questionId` to keep it
 *  distinct from the answer's own id when both appear in one path. */
export const questionIdParamSchema = z.object({
  questionId: z.uuid("Question id must be a valid UUID"),
});

export const answerIdParamSchema = z.object({
  answerId: z.uuid("Answer id must be a valid UUID"),
});

export const listAnswersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateAnswerDto = z.infer<typeof createAnswerSchema>;
export type UpdateAnswerDto = z.infer<typeof updateAnswerSchema>;
export type QuestionIdParam = z.infer<typeof questionIdParamSchema>;
export type AnswerIdParam = z.infer<typeof answerIdParamSchema>;
export type ListAnswersQuery = z.infer<typeof listAnswersQuerySchema>;
