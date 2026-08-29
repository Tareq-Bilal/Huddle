// The feature's public contract. Only the router and the response type are
// exported — vote and notification will depend on these later, and on nothing
// else in this folder.
export { commentRoutes } from "./comment.routes.ts";
export type { CommentResponse } from "./comment.model.ts";
