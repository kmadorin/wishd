type Handler = (body: unknown) => Promise<unknown>;
const registry = new Map<string, Handler>();
const key = (plugin: string, tool: string) => `${plugin}/${tool}`;

export function registerPluginTool(plugin: string, tool: string, fn: Handler): void {
  registry.set(key(plugin, tool), fn);
}

/** @internal */
export function _resetRegistryForTest(): void { registry.clear(); }

export async function handlePluginToolRoute(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // .../api/wish/<plugin>/<tool>
  const plugin = parts[parts.length - 2];
  const tool   = parts[parts.length - 1];
  const fn = plugin && tool ? registry.get(key(plugin, tool)) : undefined;
  if (!fn) {
    return new Response(JSON.stringify({ error: `unknown plugin tool: ${plugin}/${tool}` }), {
      status: 404, headers: { "content-type": "application/json" },
    });
  }
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  try {
    const out = await fn(body);
    return new Response(JSON.stringify(out ?? null), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

export async function callPluginTool<T = unknown>(plugin: string, tool: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/wish/${encodeURIComponent(plugin)}/${encodeURIComponent(tool)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? null),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json() as { error?: string }; if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
