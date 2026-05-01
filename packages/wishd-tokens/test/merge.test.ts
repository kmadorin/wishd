import { describe, it, expect } from "vitest";
import { mergeTokenLists } from "../src/merge";
import type { TokenList } from "../src/types";

// Use inline fixture data (avoids JSON import complexity for now)
const LIST_A: TokenList = {
  name: "List A",
  timestamp: "2026-01-01T00:00:00.000Z",
  version: { major: 1, minor: 0, patch: 0 },
  tokens: [
    { chainId: 1, address: "0xAAAA000000000000000000000000000000000001", name: "Token A", symbol: "TKA", decimals: 18 },
    { chainId: 1, address: "0xAAAA000000000000000000000000000000000002", name: "Token B", symbol: "TKB", decimals: 6 },
  ],
};

const LIST_B: TokenList = {
  name: "List B",
  timestamp: "2026-01-01T00:00:00.000Z",
  version: { major: 1, minor: 0, patch: 0 },
  tokens: [
    { chainId: 1, address: "0xAAAA000000000000000000000000000000000003", name: "Token C", symbol: "TKC", decimals: 18 },
  ],
};

// Override with same address as TKA but different name
const LIST_OVERRIDE: TokenList = {
  name: "Override",
  timestamp: "2026-01-01T00:00:00.000Z",
  version: { major: 1, minor: 0, patch: 0 },
  tokens: [
    { chainId: 1, address: "0xAAAA000000000000000000000000000000000001", name: "Token A Patched", symbol: "TKA", decimals: 18 },
  ],
};

describe("mergeTokenLists", () => {
  it("merges disjoint lists — length is sum of inputs", () => {
    const result = mergeTokenLists(LIST_A, LIST_B);
    expect(result).toHaveLength(3);
  });

  it("override tokens replace base tokens on (chainId, address) collision", () => {
    const result = mergeTokenLists(LIST_A, LIST_OVERRIDE);
    const tka = result.find(t => t.symbol === "TKA");
    expect(tka?.name).toBe("Token A Patched");
  });

  it("collision match is case-insensitive on address", () => {
    const upper: TokenList = {
      ...LIST_OVERRIDE,
      tokens: [{ ...LIST_OVERRIDE.tokens[0]!, address: "0xAAAA000000000000000000000000000000000001".toUpperCase() as `0x${string}` }],
    };
    const result = mergeTokenLists(LIST_A, upper);
    const tka = result.find(t => t.symbol === "TKA");
    expect(tka?.name).toBe("Token A Patched");
  });

  it("empty override is a no-op", () => {
    const empty: TokenList = { ...LIST_A, tokens: [] };
    const result = mergeTokenLists(LIST_A, empty);
    expect(result).toHaveLength(2);
  });

  it("multiple overrides — last one wins on collision", () => {
    const second: TokenList = {
      ...LIST_OVERRIDE,
      tokens: [{ ...LIST_OVERRIDE.tokens[0]!, name: "Token A Final" }],
    };
    const result = mergeTokenLists(LIST_A, LIST_OVERRIDE, second);
    const tka = result.find(t => t.symbol === "TKA");
    expect(tka?.name).toBe("Token A Final");
  });
});
