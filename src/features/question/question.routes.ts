import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as questionController from "./question.controller.ts";
import { requireQuestionOwner } from "./question.middleware.ts";
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

// authenticate sets req.user, then the id param is validated, then ownership is
// checked (needs both), then the body — controller runs only if all pass.
questionRoutes.patch(
  "/:id",
  authenticate,
  validate(questionIdParamSchema, "params"),
  requireQuestionOwner,
  validate(updateQuestionSchema, "body"),
  questionController.update,
);

questionRoutes.delete(
  "/:id",
  authenticate,
  validate(questionIdParamSchema, "params"),
  requireQuestionOwner,
  questionController.remove,
);
