import type { WorkGraphDocument } from "./schemas.js";
import { WorkGraphDocumentSchema } from "./schemas.js";

export const parseWorkGraphDocument = (value: unknown): WorkGraphDocument =>
  WorkGraphDocumentSchema.parse(structuredClone(value));
