import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as commentController from "./comment.controller.ts";
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

// Ownership is not checked here: the service enforces it, so a worker or a test
// calling it directly is held to the same rule as an HTTP request.
commentRoutes.patch(
  "/comments/:commentId",
  authenticate,
  validate(commentIdParamSchema, "params"),
  validate(updateCommentSchema, "body"),
  commentController.update,
);

commentRoutes.delete(
  "/comments/:commentId",
  authenticate,
  validate(commentIdParamSchema, "params"),
  commentController.remove,
);
