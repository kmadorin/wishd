import { describe, it, expect } from "vitest";
import {
  getToken,
  getTokens,
  findByAddress,
  listChains,
  findByCaip19,
  listForChain,
} from "../src/api";

const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

describe("getToken", () => {
  it("returns Sepolia USDC with correct address", () => {
    expect(getToken(11155111, "USDC")?.address.toLowerCase()).toBe(
      SEPOLIA_USDC.toLowerCase()
    );
  });

  it("is case-insensitive — lowercase symbol works", () => {
    expect(getToken(11155111, "usdc")).toEqual(getToken(11155111, "USDC"));
  });

  it("returns Base USDC from upstream", () => {
    const token = getToken(8453, "USDC");
    expect(token).toBeDefined();
    expect(token?.chainId).toBe(8453);
  });

  it("returns Base DAI from upstream (upstream coverage sanity)", () => {
    expect(getToken(8453, "DAI")).toBeDefined();
  });

  it("returns undefined for non-existent token", () => {
    expect(getToken(1, "DOES_NOT_EXIST")).toBeUndefined();
  });
});

describe("findByAddress", () => {
  it("finds Sepolia USDC by mixed-case address", () => {
    const mixedCase = "0x1C7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const token = findByAddress(11155111, mixedCase as `0x${string}`);
    expect(token?.symbol).toBe("USDC");
  });
});

describe("getTokens", () => {
  it("returns at least 2 tokens for Sepolia (USDC + WETH)", () => {
    expect(getTokens(11155111).length).toBeGreaterThanOrEqual(2);
  });
});

describe("listChains", () => {
  it("includes expected chains", () => {
    const chains = listChains();
    expect(chains).toContain(1);
    expect(chains).toContain(8453);
    expect(chains).toContain(42161);
    expect(chains).toContain(11155111);
  });
});

describe("findByCaip19", () => {
  it("finds ETH native on Ethereum mainnet via slip44:60", () => {
    const token = findByCaip19("eip155:1/slip44:60");
    expect(token).toBeDefined();
    expect(token?.symbol).toBe("ETH");
    expect(token?.chainId).toBe(1);
  });

  it("finds SOL native via solana mainnet slip44:501", () => {
    const token = findByCaip19("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501");
    expect(token).toBeDefined();
    expect(token?.symbol).toBe("SOL");
    expect(token?.decimals).toBe(9);
    // chainId=0 is the Solana sentinel
    expect(token?.chainId).toBe(0);
  });

  it("finds USDC on mainnet via erc20 caip19", () => {
    const usdc = getToken(1, "USDC");
    expect(usdc).toBeDefined();
    const found = findByCaip19(usdc!.caip19);
    expect(found).toBeDefined();
    expect(found?.symbol).toBe("USDC");
    expect(found?.chainId).toBe(1);
  });

  it("returns undefined for unknown caip19", () => {
    expect(findByCaip19("eip155:99999/erc20:0xdeadbeefdeadbeef")).toBeUndefined();
  });
});

describe("listForChain", () => {
  it("returns >1 token for eip155:1 and all share eip155:1 prefix", () => {
    const tokens = listForChain("eip155:1");
    expect(tokens.length).toBeGreaterThan(1);
    for (const t of tokens) {
      expect(t.caip19).toMatch(/^eip155:1\//);
    }
  });

  it("returns SOL for solana mainnet caip2", () => {
    const tokens = listForChain("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens.some(t => t.symbol === "SOL")).toBe(true);
  });

  it("returns empty array for unknown chain", () => {
    expect(listForChain("eip155:99999")).toHaveLength(0);
  });
});
