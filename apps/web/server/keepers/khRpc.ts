import { khTokenStore } from "./khTokenStore";

const KH_BASE = process.env.KH_BASE_URL ?? "https://app.keeperhub.dev";

type JsonRpcRequest = { jsonrpc: "2.0"; id: string; method: string; params: unknown };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string; result?: unknown; error?: { code: number; message: string } };

export class KhUnauthorizedError extends Error {
  constructor(message = "KeeperHub MCP returned 401 — agent must re-authorize via SDK") {
    super(message);
  }
}

async function rpc(method: string, params: unknown): Promise<unknown> {
  const tok = khTokenStore.get();
  if (!tok) throw new KhUnauthorizedError("no KH access token cached — run a recommend_keeper agent turn first");

  const body: JsonRpcRequest = { jsonrpc: "2.0", id: crypto.randomUUID(), method: `tools/call`, params: { name: method, arguments: params } };
  const res = await fetch(`${KH_BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tok.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    khTokenStore.clear();
    throw new KhUnauthorizedError();
  }
  if (!res.ok) {
    throw new Error(`KH MCP HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) throw new Error(`KH MCP error: ${json.error.message}`);
  return json.result;
}

export async function khCreateWorkflow(input: { name: string; description?: string; nodes: unknown[]; edges: unknown[] }): Promise<{ workflowId: string }> {
  const result = (await rpc("create_workflow", input)) as { id: string };
  return { workflowId: result.id };
}

export async function khUpdateWorkflow(input: { workflowId: string; nodes?: unknown[]; edges?: unknown[]; name?: string; description?: string }): Promise<void> {
  await rpc("update_workflow", input);
}

export async function khListWorkflows(): Promise<Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }>> {
  const result = (await rpc("list_workflows", {})) as Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }>;
  return result;
}
