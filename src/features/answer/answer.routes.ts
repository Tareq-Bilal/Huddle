import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as answerController from "./answer.controller.ts";
import { requireAnswerOwner } from "./answer.middleware.ts";
import {
  answerIdParamSchema,
  createAnswerSchema,
  listAnswersQuerySchema,
  questionIdParamSchema,
  updateAnswerSchema,
} from "./answer.schema.ts";

// The feature owns two path prefixes — answers hang off a question, but accept,
// edit, and delete address the answer directly — so the router carries full
// paths and is mounted at the root in routes.ts.
export const answerRoutes = Router();

answerRoutes.get(
  "/questions/:questionId/answers",
  validate(questionIdParamSchema, "params"),
  validate(listAnswersQuerySchema, "query"),
  answerController.list,
);

answerRoutes.post(
  "/questions/:questionId/answers",
  authenticate,
  validate(questionIdParamSchema, "params"),
  validate(createAnswerSchema, "body"),
  answerController.create,
);

answerRoutes.post(
  "/answers/:answerId/accept",
  authenticate,
  validate(answerIdParamSchema, "params"),
  answerController.accept,
);

answerRoutes.patch(
  "/answers/:answerId",
  authenticate,
  validate(answerIdParamSchema, "params"),
  requireAnswerOwner,
  validate(updateAnswerSchema, "body"),
  answerController.update,
);

answerRoutes.delete(
  "/answers/:answerId",
  authenticate,
  validate(answerIdParamSchema, "params"),
  requireAnswerOwner,
  answerController.remove,
);
