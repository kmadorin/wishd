import { describe, expect, it } from "vitest";
import { SOLANA_DEVNET, SOLANA_MAINNET } from "@wishd/plugin-sdk";
import { jupiterIntents, validateSwapValues } from "./intents";

describe("validateSwapValues", () => {
  it("accepts valid mainnet swap", () => {
    expect(
      validateSwapValues({
        amount: "0.1",
        assetIn: "SOL",
        assetOut: "USDC",
        chain: SOLANA_MAINNET,
        slippage: "0.5%",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects same input/output", () => {
    const r = validateSwapValues({
      amount: "0.1",
      assetIn: "SOL",
      assetOut: "SOL",
      chain: SOLANA_MAINNET,
      slippage: "0.5%",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/same input and output/i);
  });

  it("rejects non-numeric amount", () => {
    const r = validateSwapValues({
      amount: "abc",
      assetIn: "SOL",
      assetOut: "USDC",
      chain: SOLANA_MAINNET,
      slippage: "0.5%",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/amount/i);
  });

  it("rejects negative amount", () => {
    const r = validateSwapValues({
      amount: "-1",
      assetIn: "SOL",
      assetOut: "USDC",
      chain: SOLANA_MAINNET,
      slippage: "0.5%",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/amount/i);
  });

  it("rejects devnet (mainnet only)", () => {
    const r = validateSwapValues({
      amount: "0.1",
      assetIn: "SOL",
      assetOut: "USDC",
      chain: SOLANA_DEVNET,
      slippage: "0.5%",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mainnet only/i);
  });

  it("rejects EVM chain", () => {
    const r = validateSwapValues({
      amount: "0.1",
      assetIn: "SOL",
      assetOut: "USDC",
      chain: "eip155:1",
      slippage: "0.5%",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/chain/i);
  });
});

describe("jupiterIntents", () => {
  it("declares jupiter.swap intent", () => {
    expect(jupiterIntents).toHaveLength(1);
    const swap = jupiterIntents[0]!;
    expect(swap.intent).toBe("jupiter.swap");
    expect(swap.verb).toBe("swap");
    expect(swap.widget).toBe("jupiter-swap-summary");
    expect(swap.slot).toBe("flow");
    const fieldKeys = swap.fields.map((f) => f.key);
    expect(fieldKeys).toEqual(expect.arrayContaining(["amount", "assetIn", "assetOut", "chain", "slippage"]));
    const chainField = swap.fields.find((f) => f.key === "chain");
    expect(chainField).toBeDefined();
    expect((chainField as { options: string[] }).options).toEqual([SOLANA_MAINNET]);
  });
});
