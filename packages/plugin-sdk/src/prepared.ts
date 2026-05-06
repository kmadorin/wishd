import type { Call } from "./call";
import type { Observation } from "./observation";

export type Prepared<TExtras extends Record<string, unknown> = {}> = TExtras & {
  calls: Call[];
  observations?: Observation[];
  staleAfter?: number;
};
