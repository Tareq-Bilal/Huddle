import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as commentController from "./comment.controller.ts";
import { requireCommentOwner } from "./comment.middleware.ts";
import {
  answerIdParamSchema,
  commentIdParamSchema,
  createCommentSchema,
  listCommentsQuerySchema,
  questionIdParamSchema,
  updateCommentSchema,
} from "./comment.schema.ts";

// A comment addresses its parent when it is created and itself once it exists,
// so the feature spans three prefixes. The router carries full paths and is
// mounted at the root in routes.ts.
export const commentRoutes = Router();

// Reading comments is public, like reading questions and answers.
commentRoutes.get(
  "/questions/:questionId/comments",
  validate(questionIdParamSchema, "params"),
  validate(listCommentsQuerySchema, "query"),
  commentController.listOnQuestion,
);

commentRoutes.post(
  "/questions/:questionId/comments",
  authenticate,
  validate(questionIdParamSchema, "params"),
  validate(createCommentSchema, "body"),
  commentController.createOnQuestion,
);

commentRoutes.get(
  "/answers/:answerId/comments",
  validate(answerIdParamSchema, "params"),
  validate(listCommentsQuerySchema, "query"),
  commentController.listOnAnswer,
);

commentRoutes.post(
  "/answers/:answerId/comments",
  authenticate,
  validate(answerIdParamSchema, "params"),
  validate(createCommentSchema, "body"),
  commentController.createOnAnswer,
);

commentRoutes.patch(
  "/comments/:commentId",
  authenticate,
  validate(commentIdParamSchema, "params"),
  requireCommentOwner,
  validate(updateCommentSchema, "body"),
  commentController.update,
);

commentRoutes.delete(
  "/comments/:commentId",
  authenticate,
  validate(commentIdParamSchema, "params"),
  requireCommentOwner,
  commentController.remove,
);
