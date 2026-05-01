import { describe, it, expect } from "vitest";
import { definePlugin, defineKeeper } from "./index";
import type { Plugin, Keeper } from "./index";

describe("plugin-sdk", () => {
  it("definePlugin returns input unchanged", () => {
    const stub: Plugin = {
      manifest: { name: "x", version: "0", chains: [1], trust: "verified", provides: { intents: [], widgets: [], mcps: [] } },
      mcp: () => ({ server: {} as never, serverName: "x" }),
      widgets: {},
    };
    expect(definePlugin(stub)).toBe(stub);
  });

  it("defineKeeper returns input unchanged", () => {
    const stub: Keeper = {
      manifest: { name: "k", version: "0", plugins: [], chains: [1], trust: "verified", description: "" },
      paramsSchema: {},
      buildWorkflow: () => ({ name: "w", nodes: [], edges: [] }),
      delegation: () => ({ kind: "comet-allow", comet: "0x0000000000000000000000000000000000000000", manager: "0x0000000000000000000000000000000000000000" }),
    };
    expect(defineKeeper(stub)).toBe(stub);
  });
});
