import type { Request, Response } from "express";
import { catchAsync } from "../../shared/catch-async.ts";
import * as commentService from "./comment.service.ts";
import type {
  AnswerIdParam,
  CommentIdParam,
  CreateCommentDto,
  ListCommentsQuery,
  QuestionIdParam,
  UpdateCommentDto,
} from "./comment.schema.ts";

// The create and list handlers come in pairs that differ only in which kind of
// target the route addresses — the service takes it as a plain argument.

export const createOnQuestion = catchAsync(async (req: Request, res: Response) => {
  const { questionId } = req.params as unknown as QuestionIdParam;
  const comment = await commentService.createComment(
    { type: "question", id: questionId },
    req.body as CreateCommentDto,
    req.user!.id,
  );

  res.status(201).json({ comment });
});

export const createOnAnswer = catchAsync(async (req: Request, res: Response) => {
  const { answerId } = req.params as unknown as AnswerIdParam;
  const comment = await commentService.createComment(
    { type: "answer", id: answerId },
    req.body as CreateCommentDto,
    req.user!.id,
  );

  res.status(201).json({ comment });
});

export const listOnQuestion = catchAsync(async (req: Request, res: Response) => {
  const { questionId } = req.params as unknown as QuestionIdParam;
  const result = await commentService.listComments(
    { type: "question", id: questionId },
    req.query as unknown as ListCommentsQuery,
  );

  res.status(200).json(result);
});

export const listOnAnswer = catchAsync(async (req: Request, res: Response) => {
  const { answerId } = req.params as unknown as AnswerIdParam;
  const result = await commentService.listComments(
    { type: "answer", id: answerId },
    req.query as unknown as ListCommentsQuery,
  );

  res.status(200).json(result);
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const { commentId } = req.params as unknown as CommentIdParam;
  const comment = await commentService.updateComment(
    commentId,
    req.body as UpdateCommentDto,
    req.user!.id,
  );

  res.status(200).json({ comment });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const { commentId } = req.params as unknown as CommentIdParam;
  await commentService.deleteComment(commentId, req.user!.id);

  res.status(204).send();
});
