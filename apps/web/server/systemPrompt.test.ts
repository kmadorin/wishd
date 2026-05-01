import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./systemPrompt";
import type { IntentSchema } from "@wishd/plugin-sdk";

const intents: IntentSchema[] = [
  {
    intent: "compound-v3.deposit",
    verb: "deposit",
    description: "supply tokens to earn yield",
    fields: [{ key: "amount", type: "amount", required: true, default: "10" }],
    widget: "compound-summary",
  },
];

const swapIntents: IntentSchema[] = [
  ...intents,
  {
    intent: "uniswap.swap",
    verb: "swap",
    description: "exchange one token for another",
    fields: [
      { key: "amount", type: "amount", required: true, default: "0.1" },
      { key: "assetIn", type: "asset", required: true, default: "ETH", options: ["ETH", "USDC"] },
      { key: "assetOut", type: "asset", required: true, default: "USDC", options: ["ETH", "USDC"] },
      { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
    ],
    widget: "swap-summary",
  },
];

describe("buildSystemPrompt", () => {
  it("default mode lists registered intents and discourages ToolSearch", async () => {
    const p = await buildSystemPrompt({ mode: "default", intents });
    expect(p).toContain("compound-v3.deposit");
    expect(p).toMatch(/do NOT use ToolSearch/i);
    expect(p).toContain("mcp__compound__prepare_deposit");
  });

  it("narrate-only forbids tool calls", async () => {
    const p = await buildSystemPrompt({ mode: "narrate-only", intents });
    expect(p).toMatch(/Do NOT call any tools/);
    expect(p).toMatch(/Do NOT call prepare_/);
    expect(p).toMatch(/Do NOT call widget\.render/);
  });

  it("default mode contains swap flow E when uniswap.swap is registered", async () => {
    const p = await buildSystemPrompt({ mode: "default", intents: swapIntents });
    expect(p).toContain("uniswap.swap");
    expect(p).toContain("E. Swap intent");
    expect(p).toContain("mcp__uniswap__prepare_swap");
  });

  it("tools section always lists mcp__uniswap__prepare_swap", async () => {
    const p = await buildSystemPrompt({ mode: "default", intents });
    expect(p).toContain("mcp__uniswap__prepare_swap");
  });
});
