import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOLANA_MAINNET } from "@wishd/plugin-sdk";

let resolveAsset: typeof import("./resolveAsset").resolveAsset;
let _resetForTest: typeof import("./resolveAsset")._resetForTest;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("./resolveAsset");
  resolveAsset = mod.resolveAsset;
  _resetForTest = mod._resetForTest;
  _resetForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAsset", () => {
  it("returns curated SOL as native", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveAsset(SOLANA_MAINNET, "SOL");
    expect(r.isNative).toBe(true);
    expect(r.decimals).toBe(9);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns curated USDC", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveAsset(SOLANA_MAINNET, "USDC");
    expect(r.mint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(r.decimals).toBe(6);
    expect(r.isNative).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to Jupiter token list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ symbol: "FOO", address: "FoOmintaddressXYZ", decimals: 4 }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveAsset(SOLANA_MAINNET, "FOO");
    expect(r.mint).toBe("FoOmintaddressXYZ");
    expect(r.decimals).toBe(4);
    expect(r.isNative).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("LRU caches second lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ symbol: "FOO", address: "FoOmintaddressXYZ", decimals: 4 }],
    });
    vi.stubGlobal("fetch", fetchMock);
    await resolveAsset(SOLANA_MAINNET, "FOO");
    await resolveAsset(SOLANA_MAINNET, "FOO");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on unknown asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveAsset(SOLANA_MAINNET, "XXNOTFOUND")).rejects.toThrow(/unknown asset/i);
  });
});
