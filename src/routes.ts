import { Router } from "express";
import { authRoutes } from "./features/auth/index.ts";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
