import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createJupiterMcp } from "./mcp/server";
import { jupiterIntents } from "./intents";
import { JupiterSwapSummary, JupiterSwapExecute } from "./widgets";

export { buildRefreshHandler, refreshSwap } from "./refresh";
export { manifest, jupiterIntents, JupiterSwapSummary, JupiterSwapExecute };

export const jupiter = definePlugin({
  manifest,
  mcp(ctx) {
    return { server: createJupiterMcp(ctx) as any, serverName: "jupiter" };
  },
  widgets: {
    "jupiter-swap-summary": JupiterSwapSummary,
    "jupiter-swap-execute": JupiterSwapExecute,
  },
  intents: jupiterIntents,
});
