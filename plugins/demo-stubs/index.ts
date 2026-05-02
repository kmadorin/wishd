import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { definePlugin, type Plugin, type PluginCtx } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { demoIntents } from "./intents";
import { BorrowWidget, EarnVaultWidget, BridgeWidget } from "./widgets";

function buildMcp(_ctx: PluginCtx): { server: Server; serverName: string } {
  // No tools — demo intents are short-circuited by the dispatcher.
  // The MCP exists only so the plugin loader registers the namespace.
  const server = new Server(
    { name: "demo_stubs", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  return { server, serverName: "demo_stubs" };
}

export const demoStubs: Plugin = definePlugin({
  manifest,
  intents: demoIntents,
  mcp: buildMcp,
  widgets: {
    "borrow-demo": BorrowWidget,
    "earn-demo": EarnVaultWidget,
    "bridge-demo": BridgeWidget,
  },
});
