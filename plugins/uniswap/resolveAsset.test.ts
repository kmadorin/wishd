import { describe, it, expect } from "vitest";
import { resolveAsset } from "./resolveAsset";

describe("resolveAsset", () => {
  it("ETH on mainnet → native placeholder, 18 decimals", () => {
    const r = resolveAsset(1, "ETH");
    expect(r.address).toBe("0x0000000000000000000000000000000000000000");
    expect(r.decimals).toBe(18);
    expect(r.isNative).toBe(true);
    expect(r.symbol).toBe("ETH");
  });
  it("USDC on Sepolia → override address, 6 decimals, not native", () => {
    const r = resolveAsset(11155111, "USDC");
    expect(r.address.toLowerCase()).toBe("0x1c7d4b196cb0c7b01d743fbc6116a902379c7238");
    expect(r.decimals).toBe(6);
    expect(r.isNative).toBe(false);
  });
  it("MATIC on Polygon → native (chain native is MATIC, not ETH)", () => {
    const r = resolveAsset(137, "MATIC");
    expect(r.isNative).toBe(true);
    expect(r.decimals).toBe(18);
  });
  it("WETH on Sepolia → ERC-20 (override)", () => {
    const r = resolveAsset(11155111, "WETH");
    expect(r.isNative).toBe(false);
    expect(r.decimals).toBe(18);
  });
  it("throws on unknown (chain, symbol)", () => {
    expect(() => resolveAsset(11155111, "WBTC")).toThrow(/unsupported asset/i);
    expect(() => resolveAsset(999, "ETH")).toThrow(/unsupported asset/i);
  });
});
