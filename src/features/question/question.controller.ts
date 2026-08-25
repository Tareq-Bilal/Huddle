import type { Request, Response } from "express";
import { catchAsync } from "../../shared/catch-async.ts";
import type {
  CreateQuestionDto,
  ListQuestionsQuery,
  QuestionIdParam,
} from "./question.schema.ts";
import * as questionService from "./question.service.ts";

export const create = catchAsync(async (req: Request, res: Response) => {
  // `authenticate` runs before this handler, so req.user is always set here.
  const question = await questionService.createQuestion(
    req.body as CreateQuestionDto,
    req.user!.id,
  );

  res.status(201).json({ question });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await questionService.listQuestions(
    req.query as unknown as ListQuestionsQuery,
  );

  res.status(200).json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as QuestionIdParam;
  const question = await questionService.getQuestionById(id);

  res.status(200).json({ question });
});
