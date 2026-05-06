import { describe, it, expect, beforeEach } from "vitest";
import { registerPluginTool, handlePluginToolRoute, _resetRegistryForTest } from "./routes";

describe("plugin-tool route", () => {
  beforeEach(() => _resetRegistryForTest());

  it("dispatches POST /api/wish/<plugin>/<tool> to registered fn", async () => {
    registerPluginTool("uniswap", "refresh_quote", async (body) => ({ echo: body }));
    const req = new Request("http://x/api/wish/uniswap/refresh_quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echo: { a: 1 } });
  });

  it("returns 404 when plugin/tool not registered", async () => {
    const req = new Request("http://x/api/wish/missing/tool", { method: "POST", body: "{}" });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(404);
  });

  it("returns 500 when handler throws", async () => {
    registerPluginTool("p", "t", async () => { throw new Error("boom"); });
    const req = new Request("http://x/api/wish/p/t", { method: "POST", body: "{}" });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  it("rejects non-POST", async () => {
    const req = new Request("http://x/api/wish/p/t", { method: "GET" });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(405);
  });
});
