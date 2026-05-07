import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOLANA_MAINNET } from "@wishd/plugin-sdk";
import type { JupiterSwapConfig } from "./types";

let refreshSwap: typeof import("./refresh").refreshSwap;

const QUOTE_OK = {
  inAmount: "100000000",
  outAmount: "9500000",
  otherAmountThreshold: "9450000",
  priceImpactPct: "0.1",
  routePlan: [{ swapInfo: { ammKey: "amm1", label: "Whirlpool", inputMint: "in", outputMint: "out" } }],
  contextSlot: 1,
  timeTaken: 0.05,
};
const SWAP_OK = { swapTransaction: "REFRESHEDTX==", lastValidBlockHeight: 280000100 };

const CONFIG: JupiterSwapConfig = {
  caip2: SOLANA_MAINNET,
  swapper: "5tzFkiKscXHK5ZXCGbXbHcjp7VWE9P6oC9YgYJrCDcAA",
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  assetIn: "SOL",
  assetOut: "USDC",
  amountAtomic: "100000000",
  slippageBps: 50,
  dynamicSlippage: false,
};

beforeEach(async () => {
  vi.resetModules();
  ({ refreshSwap } = await import("./refresh"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshSwap", () => {
  it("returns fresh prepared with new staleAfter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => QUOTE_OK })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SWAP_OK });
    vi.stubGlobal("fetch", fetchMock);
    const before = Date.now();
    const r = await refreshSwap({ config: CONFIG, summaryId: "s1" });
    expect(r.staleAfter).toBeGreaterThanOrEqual(before + 24_500);
    const call = r.calls[0]!;
    if (call.family !== "svm" || call.kind !== "tx") throw new Error("expected SvmTxCall");
    expect(call.base64).toBe("REFRESHEDTX==");
    expect(call.lastValidBlockHeight).toBe(280000100n);
  });

  it("preserves config round-trip", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => QUOTE_OK })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SWAP_OK });
    vi.stubGlobal("fetch", fetchMock);
    const r = await refreshSwap({ config: CONFIG, summaryId: "s1" });
    expect(r.config).toEqual(CONFIG);
  });

  it("propagates /swap 400", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => QUOTE_OK })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(refreshSwap({ config: CONFIG, summaryId: "s1" })).rejects.toThrow(/jupiter swap/i);
  });
});
