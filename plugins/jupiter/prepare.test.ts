import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOLANA_MAINNET } from "@wishd/plugin-sdk";
import { mockSolanaRpc } from "@wishd/plugin-sdk/svm/testing";

let prepareSwap: typeof import("./prepare").prepareSwap;

const SWAPPER = "5tzFkiKscXHK5ZXCGbXbHcjp7VWE9P6oC9YgYJrCDcAA";

const QUOTE_OK = {
  inAmount: "100000000",
  outAmount: "9500000",
  otherAmountThreshold: "9450000",
  priceImpactPct: "0.1",
  routePlan: [
    { swapInfo: { ammKey: "amm1", label: "Whirlpool", inputMint: "in", outputMint: "out" } },
  ],
  contextSlot: 1,
  timeTaken: 0.05,
};

const SWAP_OK = {
  swapTransaction: "BASE64TX==",
  lastValidBlockHeight: 280000000,
};

function fetchSeq(_q: { ok: boolean }, _s: { ok: boolean }) {
  const fn = vi.fn();
  fn.mockResolvedValueOnce({ status: 200, ok: true, json: async () => QUOTE_OK });
  fn.mockResolvedValueOnce({ status: 200, ok: true, json: async () => SWAP_OK });
  return fn;
}

beforeEach(async () => {
  vi.resetModules();
  ({ prepareSwap } = await import("./prepare"));
  // Curated tokens — no need for fetch mock for resolveAsset.
  const { _resetForTest } = await import("./resolveAsset");
  _resetForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prepareSwap", () => {
  it("happy path SOL→USDC", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    const fetchMock = fetchSeq({ ok: true }, { ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const before = Date.now();
    const prepared = await prepareSwap({
      values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    const after = Date.now();

    expect(prepared.calls).toHaveLength(1);
    const call = prepared.calls[0]!;
    expect(call.family).toBe("svm");
    expect(call.caip2).toBe(SOLANA_MAINNET);
    if (call.family !== "svm" || call.kind !== "tx") throw new Error("expected SvmTxCall");
    expect(call.kind).toBe("tx");
    expect(call.base64).toBe("BASE64TX==");
    expect(call.lastValidBlockHeight).toBe(280000000n);
    expect(typeof call.lastValidBlockHeight).toBe("bigint");
    expect(prepared.staleAfter).toBeGreaterThanOrEqual(before + 24_500);
    expect(prepared.staleAfter).toBeLessThanOrEqual(after + 25_500);
    expect(prepared.config.assetIn).toBe("SOL");
    expect(prepared.initialQuote.outAmount).toBe("9500000");
    expect(prepared.balance).toBe("5");
    expect(prepared.insufficient).toBe(false);
  });

  it("flags insufficient balance", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 1_000_000n }) });
    vi.stubGlobal("fetch", fetchSeq({ ok: true }, { ok: true }));
    const prepared = await prepareSwap({
      values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    expect(prepared.insufficient).toBe(true);
  });

  it("forwards 1% slippage as slippageBps=100", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    const fetchMock = fetchSeq({ ok: true }, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await prepareSwap({
      values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "1%" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    const quoteUrl = fetchMock.mock.calls[0]![0] as string;
    expect(quoteUrl).toContain("slippageBps=100");
    expect(quoteUrl).not.toContain("dynamicSlippage");
  });

  it("auto slippage forwards dynamicSlippage=true", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    const fetchMock = fetchSeq({ ok: true }, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await prepareSwap({
      values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "auto" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    const quoteUrl = fetchMock.mock.calls[0]![0] as string;
    expect(quoteUrl).toContain("dynamicSlippage=true");
  });

  it("throws on /quote 400", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      prepareSwap({
        values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" },
        swapper: SWAPPER,
        rpc: rpc as never,
      }),
    ).rejects.toThrow(/jupiter quote/i);
  });

  it("throws on /swap 400", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => QUOTE_OK });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      prepareSwap({
        values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" },
        swapper: SWAPPER,
        rpc: rpc as never,
      }),
    ).rejects.toThrow(/jupiter swap/i);
  });

  it("SPL→SPL uses getTokenAccountBalance", async () => {
    const rpc = mockSolanaRpc();
    rpc.getTokenAccountBalance.mockReturnValue({
      send: async () => ({ value: { amount: "1000000000", decimals: 6 } }),
    });
    vi.stubGlobal("fetch", fetchSeq({ ok: true }, { ok: true }));
    const prepared = await prepareSwap({
      values: { amount: "10", assetIn: "USDC", assetOut: "USDT", chain: SOLANA_MAINNET, slippage: "0.5%" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    expect(rpc.getTokenAccountBalance).toHaveBeenCalled();
    expect(prepared.balance).toBe("1000");
  });

  it("posts priority fee body to /swap", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    const fetchMock = fetchSeq({ ok: true }, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await prepareSwap({
      values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    const swapInit = fetchMock.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(swapInit.body as string);
    expect(body.prioritizationFeeLamports.priorityLevelWithMaxLamports.maxLamports).toBe(5_000_000);
    expect(body.prioritizationFeeLamports.priorityLevelWithMaxLamports.priorityLevel).toBe("high");
    expect(body.wrapAndUnwrapSol).toBe(true);
    expect(body.dynamicComputeUnitLimit).toBe(true);
  });

  it("converts lastValidBlockHeight JSON number to bigint", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValue({ send: async () => ({ value: 5_000_000_000n }) });
    vi.stubGlobal("fetch", fetchSeq({ ok: true }, { ok: true }));
    const prepared = await prepareSwap({
      values: { amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" },
      swapper: SWAPPER,
      rpc: rpc as never,
    });
    const call = prepared.calls[0]!;
    if (call.family !== "svm" || call.kind !== "tx") throw new Error("expected SvmTxCall");
    expect(typeof call.lastValidBlockHeight).toBe("bigint");
  });
});
