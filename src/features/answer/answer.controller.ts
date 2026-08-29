import type { Request, Response } from "express";
import { catchAsync } from "../../shared/catch-async.ts";
import * as answerService from "./answer.service.ts";
import type {
  AnswerIdParam,
  CreateAnswerDto,
  ListAnswersQuery,
  QuestionIdParam,
  UpdateAnswerDto,
} from "./answer.schema.ts";

export const create = catchAsync(async (req: Request, res: Response) => {
  const { questionId } = req.params as unknown as QuestionIdParam;
  const answer = await answerService.createAnswer(
    questionId,
    req.body as CreateAnswerDto,
    req.user!.id,
  );

  res.status(201).json({ answer });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const { questionId } = req.params as unknown as QuestionIdParam;
  const result = await answerService.listAnswersByQuestion(
    questionId,
    req.query as unknown as ListAnswersQuery,
  );

  res.status(200).json(result);
});

export const accept = catchAsync(async (req: Request, res: Response) => {
  const { answerId } = req.params as unknown as AnswerIdParam;
  const answer = await answerService.acceptAnswer(answerId, req.user!.id);

  res.status(200).json({ answer });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  // `requireAnswerOwner` has already confirmed req.user owns this answer.
  const { answerId } = req.params as unknown as AnswerIdParam;
  const answer = await answerService.updateAnswer(answerId, req.body as UpdateAnswerDto);

  res.status(200).json({ answer });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const { answerId } = req.params as unknown as AnswerIdParam;
  await answerService.deleteAnswer(answerId);

  res.status(204).send();
});
