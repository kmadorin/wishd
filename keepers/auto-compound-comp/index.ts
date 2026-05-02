export { manifest } from "./manifest";
export { delegation } from "./delegation";
export { buildWorkflow } from "./workflow";
import { manifest } from "./manifest";
import { delegation } from "./delegation";
import { buildWorkflow } from "./workflow";
import type { Keeper } from "@wishd/plugin-sdk";

export const keeper: Keeper = { manifest, delegation, buildWorkflow };
export default keeper;
