import { describe, it, expect } from "vitest";
import { TRADING_API_CHAINS, DIRECT_V3_CHAINS, UNIVERSAL_ROUTER } from "./addresses";

describe("uniswap addresses", () => {
  it("Trading API chains include the manifest set", () => {
    for (const cid of [1, 8453, 42161, 10, 137, 130]) expect(TRADING_API_CHAINS.has(cid)).toBe(true);
  });
  it("Sepolia is direct-V3, not Trading API", () => {
    expect(TRADING_API_CHAINS.has(11155111)).toBe(false);
    expect(DIRECT_V3_CHAINS[11155111]).toBeDefined();
  });
  it("UniversalRouter populated for every TradingAPI chain", () => {
    for (const cid of TRADING_API_CHAINS) expect(UNIVERSAL_ROUTER[cid]).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
  it("DIRECT_V3_CHAINS[sepolia] has quoterV2 + swapRouter02", () => {
    const c = DIRECT_V3_CHAINS[11155111]!;
    expect(c.quoterV2).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.swapRouter02).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
