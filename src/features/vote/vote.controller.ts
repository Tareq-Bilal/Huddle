import type { Request, Response } from "express";
import { catchAsync } from "../../shared/catch-async.ts";
import type { CastVoteDto, VoteTargetParam } from "./vote.schema.ts";
import * as voteService from "./vote.service.ts";

export const voteOnQuestion = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.castVote(
    { type: "question", id },
    (req.body as CastVoteDto).value,
    req.user!.id,
  );

  res.status(200).json(result);
});

export const voteOnAnswer = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.castVote(
    { type: "answer", id },
    (req.body as CastVoteDto).value,
    req.user!.id,
  );

  res.status(200).json(result);
});

export const retractQuestionVote = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.retractVote({ type: "question", id }, req.user!.id);

  res.status(200).json(result);
});

export const retractAnswerVote = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.retractVote({ type: "answer", id }, req.user!.id);

  res.status(200).json(result);
});
