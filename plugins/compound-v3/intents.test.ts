import { describe, it, expect } from "vitest";
import { compoundIntents } from "./intents";

describe("compound-v3 intents", () => {
  it("exports deposit + withdraw with shared field shape", () => {
    expect(compoundIntents.map((i) => i.intent)).toEqual([
      "compound-v3.deposit",
      "compound-v3.withdraw",
    ]);
    for (const i of compoundIntents) {
      expect(i.fields.map((f) => f.type)).toEqual(["amount", "asset", "chain"]);
      const asset = i.fields.find((f) => f.key === "asset")!;
      expect(asset.type).toBe("asset");
      if (asset.type === "asset") expect(asset.options).toEqual(["USDC"]);
      const chain = i.fields.find((f) => f.key === "chain")!;
      expect(chain.type).toBe("chain");
      if (chain.type === "chain") expect(chain.options).toEqual(["ethereum-sepolia"]);
    }
  });

  it("deposit maps to compound-summary widget, withdraw to compound-withdraw-summary", () => {
    const deposit = compoundIntents.find((i) => i.intent === "compound-v3.deposit")!;
    const withdraw = compoundIntents.find((i) => i.intent === "compound-v3.withdraw")!;
    expect(deposit.widget).toBe("compound-summary");
    expect(withdraw.widget).toBe("compound-withdraw-summary");
  });
});
