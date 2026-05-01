import { query } from "@anthropic-ai/claude-agent-sdk";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { loadPlugins } from "./pluginLoader";
import { createWidgetRendererMcp } from "./mcps/widgetRenderer";
import { buildSystemPrompt } from "./systemPrompt";
import { listIntents } from "./intentRegistry";
import { khTokenStore } from "./keepers/khTokenStore";

export type RunMode = "default" | "narrate-only";

export type RunAgentInput = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  mode?: RunMode;
  emit: (e: ServerEvent) => void;
};

const HAIKU = "claude-haiku-4-5-20251001";

export async function runAgent(input: RunAgentInput): Promise<void> {
  const { wish, account, context, mode = "default", emit } = input;

  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const { plugins, allowedTools } = await loadPlugins();
  const intents = await listIntents();

  const pluginCtx = { publicClient, emit };
  const pluginMcps = plugins.map((p) => p.mcp(pluginCtx));
  const widgetMcp = createWidgetRendererMcp(emit);

  const KH_BASE = process.env.KH_BASE_URL ?? "https://app.keeperhub.dev";

  // Seed khTokenStore from env var on each agent turn so the deploy route can call KH directly.
  // TODO(oauth): The Agent SDK v0.2.x McpHttpServerConfig only exposes { type, url, headers, tools, alwaysLoad }
  // — there is no onTokenChange / getMcpTokens callback. Full OAuth token capture requires either:
  //   (a) a future SDK version that exposes an OAuth hook, or
  //   (b) a local MCP proxy that handles the OAuth dance and writes to khTokenStore.
  // For the demo we fall back to reading KH_ACCESS_TOKEN from env and seeding the store manually.
  const khEnvToken = process.env.KH_ACCESS_TOKEN;
  if (khEnvToken) {
    khTokenStore.set({
      accessToken: khEnvToken,
      expiresAt: Date.now() + 3_600_000, // 1 h
      scope: "mcp:write",
    });
  }

  const mcpServers: Record<string, any> = { widget: widgetMcp };
  for (const m of pluginMcps) mcpServers[m.serverName] = m.server;

  // Remote MCP — KeeperHub. SDK handles OAuth discovery when the user authenticates via Claude Code.
  // The Bearer header here covers the env-token demo path; in full OAuth the SDK will prompt the user.
  mcpServers.keeperhub = {
    type: "http" as const,
    url: `${KH_BASE}/mcp`,
    ...(khEnvToken ? { headers: { authorization: `Bearer ${khEnvToken}` } } : {}),
  };

  const systemPrompt = await buildSystemPrompt({ mode, intents });
  const userMessage = JSON.stringify({ wish, account, context: context ?? {}, mode });
  const t0 = Date.now();
  let firstTokenLogged = false;

  try {
    const stream = query({
      prompt: userMessage,
      options: {
        systemPrompt,
        model: HAIKU,
        mcpServers,
        allowedTools,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: mode === "narrate-only" ? 1 : 3,
      },
    });

    for await (const msg of stream as AsyncIterable<any>) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            if (!firstTokenLogged) {
              firstTokenLogged = true;
              console.info(JSON.stringify({ tag: "wishd:perf", event: "agent-first-token-ms", mode, ms: Date.now() - t0 }));
            }
            emit({ type: "chat.delta", delta: block.text });
          }
          if (block.type === "tool_use") {
            if (mode === "narrate-only") {
              console.warn(`narrate-only mode emitted tool_use ${block.name}; ignoring`);
              continue;
            }
            emit({ type: "tool.call", name: block.name, input: block.input });
          }
        }
      }
      if (msg.type === "result") {
        console.info(JSON.stringify({ tag: "wishd:perf", event: "agent-final-ms", mode, ms: Date.now() - t0 }));
        emit({ type: "result", ok: msg.subtype === "success", cost: msg.total_cost_usd });
      }
    }
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
