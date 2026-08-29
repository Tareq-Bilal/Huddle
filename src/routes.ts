import { Router } from "express";
import { answerRoutes } from "./features/answer/index.ts";
import { authRoutes } from "./features/auth/index.ts";
import { questionRoutes } from "./features/question/index.ts";
import { tagRoutes } from "./features/tag/index.ts";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/tags", tagRoutes);
apiRoutes.use("/questions", questionRoutes);

// Carries full paths (/questions/:id/answers and /answers/:id/*), so it mounts
// at the root rather than under a single prefix.
apiRoutes.use("/", answerRoutes);
