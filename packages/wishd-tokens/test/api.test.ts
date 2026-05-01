import { describe, it, expect } from "vitest";
import {
  getToken,
  getTokens,
  findByAddress,
  listChains,
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
