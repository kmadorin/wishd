import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { registerPluginTool, _resetRegistryForTest } from "@wishd/plugin-sdk/routes";

describe("/api/wish/[plugin]/[tool] route", () => {
  beforeEach(() => _resetRegistryForTest());

  it("delegates to handlePluginToolRoute", async () => {
    registerPluginTool("uniswap", "ping", async () => ({ pong: true }));
    const res = await POST(new Request("http://x/api/wish/uniswap/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });
});
