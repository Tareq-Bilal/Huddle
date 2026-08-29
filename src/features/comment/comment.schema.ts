import { z } from "zod";

/**
 * A comment is a short remark, so it is bounded on both ends: long enough to
 * carry a thought, short enough that anything longer belongs in an answer.
 */
export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(15, "Comment must be at least 15 characters")
    .max(600, "Comment must be at most 600 characters"),
});

/** Update takes the same single field. Sending `{}` still fails because `body`
 *  is required — there is nothing else a patch could change. */
export const updateCommentSchema = createCommentSchema;

export const questionIdParamSchema = z.object({
  questionId: z.uuid("Question id must be a valid UUID"),
});

export const answerIdParamSchema = z.object({
  answerId: z.uuid("Answer id must be a valid UUID"),
});

export const commentIdParamSchema = z.object({
  commentId: z.uuid("Comment id must be a valid UUID"),
});

export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type UpdateCommentDto = z.infer<typeof updateCommentSchema>;
export type QuestionIdParam = z.infer<typeof questionIdParamSchema>;
export type AnswerIdParam = z.infer<typeof answerIdParamSchema>;
export type CommentIdParam = z.infer<typeof commentIdParamSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
