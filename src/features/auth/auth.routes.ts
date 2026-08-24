import { Router } from "express";
import { validate } from "../../shared/validate.ts";
import * as authController from "./auth.controller.ts";
import { loginSchema, registerSchema } from "./auth.schema.ts";

export const authRoutes = Router();

authRoutes.post("/register", validate(registerSchema, "body"), authController.register);
authRoutes.post("/login", validate(loginSchema, "body"), authController.login);

// Both read the refresh token from the httpOnly cookie, so neither takes a body.
authRoutes.post("/refresh", authController.refresh);
authRoutes.post("/logout", authController.logout);
