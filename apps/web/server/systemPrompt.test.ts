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
});
