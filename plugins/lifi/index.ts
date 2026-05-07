import { definePlugin } from "@wishd/plugin-sdk";
import { registerPluginTool } from "@wishd/plugin-sdk/routes";
import { lifiManifest } from "./manifest";
import { lifiIntents } from "./intents";
import { createLifiMcp } from "./mcp/server";
import { defaultDeps } from "./_serverClients";
import { BridgeSummary, BridgeExecute, BridgeProgress } from "./widgets";
import { refreshBridgeSwap } from "./refresh";

registerPluginTool("lifi", "refresh_quote", refreshBridgeSwap as any);

export const lifi = definePlugin({
  manifest: lifiManifest,
  // `createLifiMcp` uses deps injection (not PluginCtx) so we pass defaultDeps and
  // ignore the ctx argument. The plugin entry is the PluginCtx boundary; the MCP
  // module itself can be re-instantiated with production deps from apps/web at wire-in time.
  mcp(_ctx) {
    return { server: createLifiMcp(defaultDeps) as any, serverName: "lifi" };
  },
  widgets: {
    "lifi-bridge-summary": BridgeSummary,
    "lifi-bridge-execute": BridgeExecute,
    "lifi-bridge-progress": BridgeProgress,
  },
  intents: lifiIntents,
});

export { BridgeSummary, BridgeExecute, BridgeProgress, lifiManifest, lifiIntents };
export { buildRefreshHandler } from "./refresh";
export { setServerDeps } from "./_serverClients";
export type { ServerDeps } from "./_serverClients";
