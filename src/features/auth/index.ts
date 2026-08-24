// The feature's public contract. Other features and routes.ts see only this —
// services, controllers, and token handling stay internal to the folder.
export { authRoutes } from "./auth.routes.ts";
export type { AuthUser } from "./auth.model.ts";
