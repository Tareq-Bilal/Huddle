import { Router } from "express";
import { answerRoutes } from "./features/answer/index.ts";
import { authRoutes } from "./features/auth/index.ts";
import { commentRoutes } from "./features/comment/index.ts";
import { questionRoutes } from "./features/question/index.ts";
import { tagRoutes } from "./features/tag/index.ts";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/tags", tagRoutes);
apiRoutes.use("/questions", questionRoutes);

// These two carry full paths — answers and comments hang off their parent, so
// their routers span several prefixes and mount at the root.
apiRoutes.use("/", answerRoutes);
apiRoutes.use("/", commentRoutes);
