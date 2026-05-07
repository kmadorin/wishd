import { describe, it, expect } from "vitest";
import { uniswapIntents, validateSwapValues, CHAIN_ID_BY_SLUG, SUPPORTED_CHAIN_SLUGS, applyAssetChange } from "./intents";

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

  it("accepts CAIP-2 chain values", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "USDC", chain: "eip155:8453" }))
      .not.toThrow();
  });
});

describe("applyAssetChange", () => {
  it("sets in side normally when no collision", () => {
    expect(applyAssetChange("in", "WETH", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "WETH", assetOut: "USDC" });
  });

  it("sets out side normally when no collision", () => {
    expect(applyAssetChange("out", "DAI", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "ETH", assetOut: "DAI" });
  });

  it("auto-flips when in == prev.out", () => {
    expect(applyAssetChange("in", "USDC", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "USDC", assetOut: "ETH" });
  });

  it("auto-flips when out == prev.in", () => {
    expect(applyAssetChange("out", "ETH", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "USDC", assetOut: "ETH" });
  });

  it("no-op when picking the same value already on that side", () => {
    expect(applyAssetChange("in", "ETH", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "ETH", assetOut: "USDC" });
  });
});
