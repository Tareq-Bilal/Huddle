import { Router } from "express";
import { authRoutes } from "./features/auth/index.ts";
import { tagRoutes } from "./features/tag/index.ts";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/tags", tagRoutes);
