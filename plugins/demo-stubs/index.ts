import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { definePlugin, type Plugin, type PluginCtx } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { demoIntents } from "./intents";
import { BorrowWidget, EarnVaultWidget, BridgeWidget } from "./widgets";

function buildMcp(_ctx: PluginCtx) {
  // No tools — demo intents are short-circuited by the dispatcher.
  // The MCP exists only so the plugin loader registers the namespace.
  // Must use createSdkMcpServer (not raw @modelcontextprotocol/sdk Server) so
  // the Agent SDK can serialize it without circular-Zod errors.
  const server = createSdkMcpServer({
    name: "demo_stubs",
    version: "0.0.0",
    tools: [],
  });
  return { server: server as any, serverName: "demo_stubs" };
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
