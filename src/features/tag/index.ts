// The feature's public contract. `findOrCreateByNames` is here because the
// question feature needs it when a question is posted — everything else about
// how tags resolve stays internal to this folder.
export { tagRoutes } from "./tag.routes.ts";
export { findOrCreateByNames } from "./tag.service.ts";
export type { Tag, TagSuggestion } from "./tag.model.ts";
