import { describe, it, expect } from "vitest";
import { renderSentenceParts } from "./sentence";
import type { IntentSchema } from "./index";

const deposit: IntentSchema = {
  intent: "compound-v3.deposit",
  verb: "deposit",
  description: "supply tokens to earn yield",
  widget: "compound-summary",
  fields: [
    { key: "amount", type: "amount", required: true, default: "10" },
    { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
    { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
  ],
  connectors: { chain: "on" },
};

describe("renderSentenceParts", () => {
  it("interleaves connectors before fields", () => {
    const parts = renderSentenceParts(deposit);
    expect(parts).toEqual([
      { kind: "field", key: "amount" },
      { kind: "field", key: "asset" },
      { kind: "connector", text: "on" },
      { kind: "field", key: "chain" },
    ]);
  });
});
