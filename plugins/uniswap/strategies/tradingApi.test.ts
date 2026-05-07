// plugins/uniswap/strategies/tradingApi.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradingApiStrategy } from "./tradingApi";

const QUOTE_RES = {
  routing: "CLASSIC",
  quote: { input: { amount: "100000000", token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" }, output: { amount: "33000000000000000", token: "0x0000000000000000000000000000000000000000" }, gasFeeUSD: "0.42", priceImpact: 0.01, deadline: 9999999999 },
  permitData: { domain: {}, types: {}, values: {} },
};
const SWAP_RES = { swap: { to: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af", data: "0xdeadbeef", value: "0x0", from: "0x000000000000000000000000000000000000bEEF" } };

describe("tradingApiStrategy", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-05-01T00:00:00Z")));

  it("/check_approval — sends chainId as string, returns null when API returns null approval", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ approval: null }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const out = await s.checkApproval({ chainId: 8453, walletAddress: "0x000000000000000000000000000000000000bEEF" as any, token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, amountWei: "1" });
    expect(out.approvalCall).toBeNull();
    const sentBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(sentBody.chainId).toBe("8453");
  });

  it("/check_approval — short-circuits null for native (0x000…)", async () => {
    const fetchMock = vi.fn();
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const out = await s.checkApproval({ chainId: 1, walletAddress: "0x000000000000000000000000000000000000bEEF" as any, token: "0x0000000000000000000000000000000000000000" as any, amountWei: "1" });
    expect(out.approvalCall).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("/quote — pins CLASSIC + V2/V3/V4 + deadline now+300 + chainIds as strings", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(QUOTE_RES), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await s.quote({ chainId: 8453, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, tokenOut: "0x0000000000000000000000000000000000000000" as any, amountIn: "1000000", slippageBps: 50, assetIn: "USDC", assetOut: "ETH", strategyTag: "trading-api" });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.routingPreference).toBe("CLASSIC");
    expect(body.protocols).toEqual(["V2","V3","V4"]);
    expect(body.tokenInChainId).toBe("8453");
    expect(body.tokenOutChainId).toBe("8453");
    expect(body.deadline).toBe(Math.floor(Date.now()/1000) + 300);
    expect(body.slippageTolerance).toBeCloseTo(0.5);
  });

  it("/quote — rejects non-CLASSIC routing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ routing: "DUTCH_V2" }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await expect(s.quote({ chainId: 1, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "trading-api" })).rejects.toThrow(/unsupported_routing/);
  });

  it("/swap — strips permitData and permitTransaction unconditionally", async () => {
    const swapMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(SWAP_RES), { status: 200 }));
    const checkMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ approval: null }), { status: 200 }));
    const fetchMock = vi.fn()
      .mockImplementationOnce(swapMock)
      .mockImplementationOnce(checkMock);
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const quote = { amountIn: "1", amountOut: "1", amountOutMin: "1", rate: "", route: "", expiresAt: Date.now()+30000,
      raw: { ...QUOTE_RES, permitData: { x: 1 }, permitTransaction: { y: 2 } } };
    await s.swap({ config: { chainId: 1, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "trading-api" }, quote: quote as any });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.permitData).toBeUndefined();
    expect(body.permitTransaction).toBeUndefined();
  });

  it("/swap — rejects empty data hex", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ swap: { to: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af", data: "0x", value: "0x0" } }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await expect(s.swap({ config: { chainId: 1, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "trading-api" } as any, quote: { raw: {}, amountIn: "1" } as any })).rejects.toThrow(/calldata|empty/i);
  });
});

import type { SwapConfig } from "../types";

describe("tradingApi quote decimals", () => {
  function fakeFetch(response: unknown): typeof fetch {
    return (async () => new Response(JSON.stringify(response), { status: 200 })) as typeof fetch;
  }

  const ethToUsdcCfg: SwapConfig = {
    chainId: 1,
    swapper: "0x0000000000000000000000000000000000000001",
    tokenIn:  "0x0000000000000000000000000000000000000000", // ETH
    tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC mainnet
    assetIn: "ETH", assetOut: "USDC",
    amountIn: "100000000000000000", // 0.1 ETH in wei
    slippageBps: 50,
    strategyTag: "trading-api",
  };

  it("formats amountOut using assetOut decimals (USDC = 6)", async () => {
    // Trading-API returns raw smallest-unit amounts.
    // 300 USDC = 300_000_000 (6 decimals).
    const apiResponse = {
      routing: "CLASSIC",
      quote: {
        input:  { amount: "100000000000000000" },
        output: { amount: "300000000" },
        minOutput: { amount: "298500000" },
        rate: "1 ETH = 3000 USDC",
        routeString: "ETH > USDC",
      },
    };
    const strat = tradingApiStrategy({ apiKey: "k", fetchImpl: fakeFetch(apiResponse) });
    const q = await strat.quote(ethToUsdcCfg);
    expect(q.amountOut).toBe("300");
    expect(q.amountOutMin).toBe("298.5");
  });

  it("formats amountOut using assetOut decimals (ETH = 18)", async () => {
    const usdcToEthCfg: SwapConfig = {
      ...ethToUsdcCfg,
      tokenIn:  ethToUsdcCfg.tokenOut,
      tokenOut: ethToUsdcCfg.tokenIn,
      assetIn: "USDC", assetOut: "ETH",
      amountIn: "100000000", // 100 USDC raw
    };
    // 0.0333 ETH out = 33300000000000000 wei.
    const apiResponse = {
      routing: "CLASSIC",
      quote: {
        input:  { amount: "100000000" },
        output: { amount: "33300000000000000" },
        minOutput: { amount: "33133500000000000" },
      },
    };
    const strat = tradingApiStrategy({ apiKey: "k", fetchImpl: fakeFetch(apiResponse) });
    const q = await strat.quote(usdcToEthCfg);
    expect(q.amountOut).toBe("0.0333");
    expect(q.amountOutMin).toBe("0.0331335");
  });
});
