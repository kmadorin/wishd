import { describe, it, expect } from "vitest";
import { getToken } from "@wishd/tokens";
import { COMPOUND_ADDRESSES } from "@plugins/compound-v3/addresses";

const SEPOLIA_CHAIN_ID = 11155111;

describe("@wishd/tokens integration", () => {
  it("getToken(11155111, 'USDC') resolves to the same address used by compound-v3 plugin", () => {
    const token = getToken(SEPOLIA_CHAIN_ID, "USDC");
    expect(token).toBeDefined();
    const compoundUsdc = COMPOUND_ADDRESSES[SEPOLIA_CHAIN_ID]?.USDC;
    expect(compoundUsdc).toBeDefined();
    expect(token?.address.toLowerCase()).toBe(compoundUsdc?.toLowerCase());
  });
});
