import { describe, it, expect, beforeEach, vi } from "vitest";
import { SOLANA_MAINNET, NATIVE_EVM_MARKER } from "./addresses";

// Mock @wishd/tokens - best-effort import
vi.mock("@wishd/tokens", () => ({
  findByCaip19: vi.fn().mockReturnValue(undefined),
}));

// Mock @wishd/plugin-jupiter/resolveAsset (the SVM token list)
vi.mock("@wishd/plugin-jupiter/resolveAsset", () => ({
  resolveAsset: vi.fn(),
  _resetForTest: vi.fn(),
}));

describe("resolveAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module-level caches before each test
    vi.resetModules();
  });

  it("curated EVM hit: USDC on Ethereum mainnet (no network call)", async () => {
    const { resolveAsset } = await import("./resolveAsset");
    const result = await resolveAsset("eip155:1", "USDC");
    expect(result.decimals).toBe(6);
    expect(result.address.toLowerCase()).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(result.isNative).toBe(false);
    expect(result.caip19).toMatch(/eip155:1\/erc20:/i);
  });

  it("curated SVM hit: SOL native on Solana mainnet (no network call)", async () => {
    const { resolveAsset } = await import("./resolveAsset");
    const result = await resolveAsset(SOLANA_MAINNET, "SOL");
    expect(result.decimals).toBe(9);
    expect(result.isNative).toBe(true);
    expect(result.caip19).toContain("slip44:501");
  });

  it("EVM native marker: ETH on Ethereum mainnet", async () => {
    const { resolveAsset } = await import("./resolveAsset");
    const result = await resolveAsset("eip155:1", "ETH");
    expect(result.address).toBe(NATIVE_EVM_MARKER);
    expect(result.isNative).toBe(true);
    expect(result.decimals).toBe(18);
    expect(result.caip19).toBe("eip155:1/slip44:60");
  });

  it("EVM unknown falls back to Li.Fi tokens API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tokens: {
          8453: [
            {
              address: "0x532f27101965dd16442e59d40670faf5ebb142e4",
              symbol: "BRETT",
              decimals: 18,
              chainId: 8453,
            },
          ],
        },
      }),
    } as any);

    const { resolveAsset } = await import("./resolveAsset");
    const result = await resolveAsset("eip155:8453", "BRETT");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("li.quest/v1/tokens"),
      expect.anything(),
    );
    expect(result.decimals).toBe(18);
    expect(result.address.toLowerCase()).toContain("532f");
    expect(result.caip19).toMatch(/eip155:8453\/erc20:/i);
  });

  it("SVM unknown falls back to Jupiter token list", async () => {
    const jupiterMock = await import("@wishd/plugin-jupiter/resolveAsset");
    vi.mocked(jupiterMock.resolveAsset).mockResolvedValueOnce({
      mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      decimals: 6,
      isNative: false,
    });

    const { resolveAsset } = await import("./resolveAsset");
    const result = await resolveAsset(SOLANA_MAINNET, "JUP");

    expect(jupiterMock.resolveAsset).toHaveBeenCalled();
    expect(result.decimals).toBe(6);
    expect(result.caip19).toMatch(/token:/);
    expect(result.isNative).toBe(false);
  });

  it("total miss throws error with 'unknown asset' and the symbol", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tokens: { 1: [] } }),
    } as any);

    const { resolveAsset } = await import("./resolveAsset");
    await expect(resolveAsset("eip155:1", "ZZZNOTEXIST")).rejects.toThrow(
      /unknown asset.*ZZZNOTEXIST/i,
    );
  });
});
