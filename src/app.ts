import cookieParser from "cookie-parser";
import express from "express";
import { apiRoutes } from "./routes.ts";
import { errorHandler } from "./shared/middlewares/error-handler.ts";
import { notFound } from "./shared/middlewares/not-found.ts";
import { requestLogger } from "./shared/middlewares/request-logger.ts";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.ts";
export const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet());
app.use(cors());
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1", apiRoutes);

app.use(notFound);
app.use(errorHandler);
