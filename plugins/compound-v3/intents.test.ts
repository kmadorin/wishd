import { describe, it, expect } from "vitest";
import { compoundIntents } from "./intents";
import { EIP155 } from "@wishd/plugin-sdk";

describe("compound-v3 intents", () => {
  it("exports deposit, withdraw, and lend intents", () => {
    expect(compoundIntents.map((i) => i.intent)).toEqual([
      "compound-v3.deposit",
      "compound-v3.withdraw",
      "compound-v3.lend",
    ]);
  });

  it("deposit and withdraw share field shape", () => {
    const depositWithdraw = compoundIntents.filter(
      (i) => i.intent === "compound-v3.deposit" || i.intent === "compound-v3.withdraw"
    );
    for (const i of depositWithdraw) {
      expect(i.fields.map((f) => f.type)).toEqual(["amount", "asset", "chain"]);
      const asset = i.fields.find((f) => f.key === "asset")!;
      expect(asset.type).toBe("asset");
      if (asset.type === "asset") expect(asset.options).toEqual(["USDC"]);
      const chain = i.fields.find((f) => f.key === "chain")!;
      expect(chain.type).toBe("chain");
      if (chain.type === "chain") expect(chain.options).toEqual([EIP155(11155111)]);
    }
  });

  it("deposit maps to compound-summary widget, withdraw to compound-withdraw-summary", () => {
    const deposit = compoundIntents.find((i) => i.intent === "compound-v3.deposit")!;
    const withdraw = compoundIntents.find((i) => i.intent === "compound-v3.withdraw")!;
    expect(deposit.widget).toBe("compound-summary");
    expect(withdraw.widget).toBe("compound-withdraw-summary");
  });
});
