import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createUniswapMcp } from "./mcp/server";
import { uniswapIntents } from "./intents";
import { SwapSummary, SwapExecute } from "./widgets";

export const uniswap = definePlugin({
  manifest,
  mcp(ctx) { return { server: createUniswapMcp(ctx) as any, serverName: "uniswap" }; },
  widgets: { "swap-summary": SwapSummary, "swap-execute": SwapExecute },
  intents: uniswapIntents,
});

export { SwapSummary, SwapExecute, manifest, uniswapIntents };
