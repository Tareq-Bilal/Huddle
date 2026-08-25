import type { Request, Response } from "express";
import { catchAsync } from "../../shared/catch-async.ts";
import type { CreateTagDto, SearchTagsQuery, TagSlugParam } from "./tag.schema.ts";
import * as tagService from "./tag.service.ts";

export const search = catchAsync(async (req: Request, res: Response) => {
  const { q, limit } = req.query as unknown as SearchTagsQuery;
  const tags = await tagService.searchTags(q, limit);

  res.status(200).json({ tags });
});

export const getBySlug = catchAsync(async (req: Request, res: Response) => {
  const { slug } = req.params as unknown as TagSlugParam;
  const tag = await tagService.getTagBySlug(slug);

  res.status(200).json({ tag });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const { name } = req.body as CreateTagDto;
  const tag = await tagService.createTag(name);

  res.status(201).json({ tag });
});
