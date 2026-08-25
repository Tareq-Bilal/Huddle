import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as tagController from "./tag.controller.ts";
import { createTagSchema, searchTagsQuerySchema, tagSlugParamSchema } from "./tag.schema.ts";

export const tagRoutes = Router();

// Autocomplete and browsing are public — you should not need an account to
// discover what a question could be tagged with.
tagRoutes.get("/", validate(searchTagsQuerySchema, "query"), tagController.search);
tagRoutes.get("/:slug", validate(tagSlugParamSchema, "params"), tagController.getBySlug);

// Creating a tag changes the shared taxonomy, so it needs a logged-in caller.
tagRoutes.post("/", authenticate, validate(createTagSchema, "body"), tagController.create);
