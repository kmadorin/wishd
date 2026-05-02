import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { khTokenStore } from "./khTokenStore";
import { refreshToken as khRefreshToken } from "./khOAuth";

const KH_BASE = process.env.KH_BASE_URL ?? "http://localhost:5347";

export class KhUnauthorizedError extends Error {
  constructor(message = "KeeperHub MCP returned 401 — agent must re-authorize via SDK") {
    super(message);
  }
}

async function withClient<T>(fn: (client: Client) => Promise<T>, retried = false): Promise<T> {
  const tok = khTokenStore.get();
  if (!tok) {
    if (!retried && (await khRefreshToken())) return withClient(fn, true);
    throw new KhUnauthorizedError("no KH access token cached");
  }

  const transport = new StreamableHTTPClientTransport(new URL(`${KH_BASE}/mcp`), {
    requestInit: {
      headers: { authorization: `Bearer ${tok.accessToken}` },
    },
  });
  const client = new Client({ name: "wishd", version: "0.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    return await fn(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || /unauthor/i.test(msg)) {
      khTokenStore.clear();
      try { await transport.close(); } catch { /* ignore */ }
      if (!retried && (await khRefreshToken())) return withClient(fn, true);
      throw new KhUnauthorizedError();
    }
    throw err;
  } finally {
    try { await transport.close(); } catch { /* ignore */ }
  }
}

type CallToolResult = { content: Array<{ type: string; text?: string }>; structuredContent?: unknown };

function parseToolResult(result: CallToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function khCreateWorkflow(input: { name: string; description?: string; nodes: unknown[]; edges: unknown[] }): Promise<{ workflowId: string }> {
  return withClient(async (client) => {
    const result = (await client.callTool({ name: "create_workflow", arguments: input as Record<string, unknown> })) as CallToolResult;
    const data = parseToolResult(result) as { id: string } | null;
    if (!data?.id) throw new Error("create_workflow: missing id in response");
    return { workflowId: data.id };
  });
}

export async function khUpdateWorkflow(input: { workflowId: string; nodes?: unknown[]; edges?: unknown[]; name?: string; description?: string }): Promise<void> {
  await withClient(async (client) => {
    await client.callTool({ name: "update_workflow", arguments: input as Record<string, unknown> });
    return null;
  });
}

export async function khListWorkflows(): Promise<Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }>> {
  return withClient(async (client) => {
    const result = (await client.callTool({ name: "list_workflows", arguments: {} })) as CallToolResult;
    const data = parseToolResult(result);
    if (Array.isArray(data)) return data as Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }>;
    if (data && typeof data === "object" && "workflows" in data) {
      return (data as { workflows: Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }> }).workflows;
    }
    return [];
  });
}
