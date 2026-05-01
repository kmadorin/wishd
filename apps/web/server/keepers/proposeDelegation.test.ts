import { describe, it, expect } from "vitest";
import { proposeDelegation, type DelegationProposal } from "./proposeDelegation";
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";
import { COMP_SEPOLIA, USDC_SEPOLIA, COMP_DECIMALS, USDC_DECIMALS } from "@wishd/keeper-auto-compound-comp/addresses";

const KEEPER = autoCompoundComp;

describe("proposeDelegation", () => {
  it("returns defaults when agent suggestion is null", () => {
    const p = proposeDelegation({ keeper: KEEPER, agentSuggestion: null });
    expect(p.expiry.kind).toBe("unlimited");
    expect(p.spend.length).toBeGreaterThan(0);
  });

  it("clamps spend limit above maxLimit down to maxLimit", () => {
    const huge = 99_999n * 10n ** BigInt(COMP_DECIMALS);
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: COMP_SEPOLIA, limit: huge, period: "month" }] },
    });
    const comp = p.spend.find((s) => s.token === COMP_SEPOLIA);
    if (!comp) throw new Error("missing COMP entry");
    expect(comp.limit).toBe(1000n * 10n ** BigInt(COMP_DECIMALS)); // bound max
  });

  it("preserves valid in-bounds limit unchanged", () => {
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: USDC_SEPOLIA, limit: 500n * 10n ** BigInt(USDC_DECIMALS), period: "month" }] },
    });
    const usdc = p.spend.find((s) => s.token === USDC_SEPOLIA);
    expect(usdc?.limit).toBe(500n * 10n ** BigInt(USDC_DECIMALS));
  });

  it("rejects period not in bounds.periods (falls back to default period for that token)", () => {
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: COMP_SEPOLIA, limit: 1n, period: "day" as never }] },
    });
    const comp = p.spend.find((s) => s.token === COMP_SEPOLIA);
    expect(comp?.period).toBe("month"); // default fallback
  });

  it("ignores spend entries for tokens not in bounds", () => {
    const random = "0x000000000000000000000000000000000000dEaD" as const;
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: random, limit: 1n, period: "month" }] },
    });
    expect(p.spend.find((s) => s.token === random)).toBeUndefined();
  });
});
