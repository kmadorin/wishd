import { describe, it, expect } from "vitest";
import { validateTokenList } from "../src/validate";

const MINIMAL_VALID: unknown = {
  name: "Test List",
  timestamp: "2026-01-01T00:00:00.000Z",
  version: { major: 1, minor: 0, patch: 0 },
  tokens: [
    {
      chainId: 1,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
    },
  ],
};

describe("validateTokenList", () => {
  it("accepts a minimal valid token list", () => {
    expect(() => validateTokenList(MINIMAL_VALID)).not.toThrow();
  });

  it("throws on a list missing version", () => {
    const bad = { ...MINIMAL_VALID as object, version: undefined };
    expect(() => validateTokenList(bad)).toThrow("schema validation");
  });
});
