// The feature's public contract. Only the router and the response types are
// exported — answer, comment, and vote will depend on these later, and on
// nothing else in this folder.
export { questionRoutes } from "./question.routes.ts";
export type { QuestionDetail, QuestionSummary } from "./question.model.ts";
