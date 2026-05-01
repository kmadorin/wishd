import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createCompoundMcp } from "./mcp/server";
import { CompoundSummary, CompoundExecute, CompoundWithdrawSummary } from "./widgets";

export const compoundV3 = definePlugin({
  manifest,
  mcp(ctx) {
    return { server: createCompoundMcp(ctx) as any, serverName: "compound" };
  },
  widgets: {
    "compound-summary": CompoundSummary,
    "compound-execute": CompoundExecute,
    "compound-withdraw-summary": CompoundWithdrawSummary,
  },
});

export { CompoundSummary, CompoundExecute, CompoundWithdrawSummary, manifest };
