import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as questionController from "./question.controller.ts";
import {
  createQuestionSchema,
  listQuestionsQuerySchema,
  questionIdParamSchema,
  updateQuestionSchema,
} from "./question.schema.ts";

export const questionRoutes = Router();

// Reading questions is public — that is the whole point of a Q&A site.
questionRoutes.get("/", validate(listQuestionsQuerySchema, "query"), questionController.list);
questionRoutes.get("/:id", validate(questionIdParamSchema, "params"), questionController.getById);

questionRoutes.post(
  "/",
  authenticate,
  validate(createQuestionSchema, "body"),
  questionController.create,
);

// Ownership is not checked here: the service enforces it, so a worker or a test
// calling it directly is held to the same rule as an HTTP request.
questionRoutes.patch(
  "/:id",
  authenticate,
  validate(questionIdParamSchema, "params"),
  validate(updateQuestionSchema, "body"),
  questionController.update,
);

questionRoutes.delete(
  "/:id",
  authenticate,
  validate(questionIdParamSchema, "params"),
  questionController.remove,
);
