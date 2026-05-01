import { describe, it, expect } from "vitest";
import { uniswapIntents, validateSwapValues, CHAIN_ID_BY_SLUG, SUPPORTED_CHAIN_SLUGS } from "./intents";

describe("uniswapIntents", () => {
  it("exposes uniswap.swap with assetIn/assetOut/amount/chain", () => {
    const s = uniswapIntents[0]!;
    expect(s.intent).toBe("uniswap.swap");
    const keys = s.fields.map((f) => f.key).sort();
    expect(keys).toEqual(["amount", "assetIn", "assetOut", "chain"].sort());
  });

  it("widget is swap-summary", () => {
    expect(uniswapIntents[0]!.widget).toBe("swap-summary");
  });

  it("rejects assetIn === assetOut", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "ETH", chain: "ethereum" }))
      .toThrow(/different assets/i);
  });

  it("rejects unknown chain slug", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "USDC", chain: "moonbeam" }))
      .toThrow(/unsupported chain/i);
  });

  it("rejects malformed amount", () => {
    expect(() => validateSwapValues({ amount: "abc", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .toThrow(/invalid amount/i);
    expect(() => validateSwapValues({ amount: "", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .toThrow(/invalid amount/i);
  });

  it("accepts a valid combo", () => {
    expect(() => validateSwapValues({ amount: "0.1", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .not.toThrow();
  });

  it("CHAIN_ID_BY_SLUG covers all supported chains", () => {
    for (const slug of SUPPORTED_CHAIN_SLUGS) expect(CHAIN_ID_BY_SLUG[slug]).toBeGreaterThan(0);
  });
});
