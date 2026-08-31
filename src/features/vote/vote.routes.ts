import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as voteController from "./vote.controller.ts";
import { castVoteSchema, voteTargetParamSchema } from "./vote.schema.ts";

// Mounted at /votes in routes.ts; the paths here say which kind of thing the
// vote lands on. Every route needs a logged-in caller.
export const voteRoutes = Router();

voteRoutes.post(
  "/questions/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  validate(castVoteSchema, "body"),
  voteController.voteOnQuestion,
);

voteRoutes.delete(
  "/questions/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  voteController.retractQuestionVote,
);

voteRoutes.post(
  "/answers/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  validate(castVoteSchema, "body"),
  voteController.voteOnAnswer,
);

voteRoutes.delete(
  "/answers/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  voteController.retractAnswerVote,
);
