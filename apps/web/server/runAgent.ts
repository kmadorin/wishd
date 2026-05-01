import { query } from "@anthropic-ai/claude-agent-sdk";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { loadPlugins } from "./pluginLoader";
import { createWidgetRendererMcp } from "./mcps/widgetRenderer";
import { buildSystemPrompt } from "./systemPrompt";

export type RunAgentInput = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  emit: (e: ServerEvent) => void;
};

export async function runAgent(input: RunAgentInput): Promise<void> {
  const { wish, account, context, emit } = input;

  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const { plugins, allowedTools } = await loadPlugins();

  const pluginCtx = { publicClient, emit };
  const pluginMcps = plugins.map((p) => p.mcp(pluginCtx));
  const widgetMcp = createWidgetRendererMcp(emit);

  const mcpServers: Record<string, any> = { widget: widgetMcp };
  for (const m of pluginMcps) mcpServers[m.serverName] = m.server;

  const systemPrompt = await buildSystemPrompt();

  const userMessage = JSON.stringify({ wish, account, context: context ?? {} });

  try {
    const stream = query({
      prompt: userMessage,
      options: {
        systemPrompt,
        mcpServers,
        allowedTools,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 4,
      },
    });

    for await (const msg of stream as AsyncIterable<any>) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            emit({ type: "chat.delta", delta: block.text });
          }
          if (block.type === "tool_use") {
            emit({ type: "tool.call", name: block.name, input: block.input });
          }
        }
      }
      if (msg.type === "result") {
        emit({ type: "result", ok: msg.subtype === "success", cost: msg.total_cost_usd });
      }
    }
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
