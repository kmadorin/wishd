import { describe, it, expect } from "vitest";
import { delegation } from "./delegation";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
} from "./addresses";

describe("auto-compound-comp delegation", () => {
  it("uses porto-permissions kind", () => {
    expect(delegation.kind).toBe("porto-permissions");
  });

  it("allowlist contains exactly the five keeper-touched contracts with signatures", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(new Set(delegation.fixed.calls.map((c) => c.to))).toEqual(new Set([
      COMET_REWARDS_SEPOLIA,
      COMP_SEPOLIA,
      UNISWAP_ROUTER_SEPOLIA,
      USDC_SEPOLIA,
      COMET_USDC_SEPOLIA,
    ]));
    for (const c of delegation.fixed.calls) {
      expect(c.signature.length).toBeGreaterThan(0);
    }
  });

  it("feeToken is an ETH object with a decimal-string limit", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(delegation.fixed.feeToken).toEqual({ symbol: "ETH", limit: "0.05" });
  });

  it("expiryPolicy is unlimited", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(delegation.expiryPolicy).toEqual({ kind: "unlimited" });
  });

  it("spend bounds and defaults are non-empty and consistent", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    const tokens = new Set(delegation.spend.defaults.map((d) => d.token));
    for (const b of delegation.spend.bounds) {
      expect(tokens).toContain(b.token);
    }
    for (const d of delegation.spend.defaults) {
      const b = delegation.spend.bounds.find((bb) => bb.token === d.token);
      if (!b) throw new Error(`no bound for default token ${d.token}`);
      expect(d.limit).toBeLessThanOrEqual(b.maxLimit);
      expect(b.periods).toContain(d.period);
    }
  });
});
