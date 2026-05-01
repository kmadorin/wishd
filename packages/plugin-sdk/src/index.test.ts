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

  it("Plugin accepts optional intents array of IntentSchema", () => {
    const schema: import("./index").IntentSchema = {
      intent: "compound-v3.deposit",
      verb: "deposit",
      description: "supply tokens to earn yield",
      fields: [
        { key: "amount", type: "amount", required: true, default: "10" },
        { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
        { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
      ],
      widget: "compound-summary",
      slot: "flow",
    };
    const stub: Plugin = {
      manifest: { name: "x", version: "0", chains: [1], trust: "verified", provides: { intents: [], widgets: [], mcps: [] } },
      mcp: () => ({ server: {} as never, serverName: "x" }),
      widgets: {},
      intents: [schema],
    };
    expect(definePlugin(stub).intents).toEqual([schema]);
  });
});
