// The feature's public contract. Only the router and the response type are
// exported — comment, vote, and notification will depend on these later, and on
// nothing else in this folder.
export { answerRoutes } from "./answer.routes.ts";
export type { AnswerResponse } from "./answer.model.ts";
