// plugins/uniswap/prepare.test.ts
import { describe, it, expect, vi } from "vitest";
import { prepareSwap } from "./prepare";

const SWAPPER = "0x000000000000000000000000000000000000bEEF" as const;

const fakeQuote = (over = {}) => ({ amountIn: "0.1", amountOut: "300", amountOutMin: "298.5", rate: "1 ETH = 3000 USDC", route: "Uniswap v3", expiresAt: Date.now() + 30_000, raw: {}, ...over });

function strategyStub(out: any) {
  return { quote: vi.fn().mockResolvedValue(out.quote), checkApproval: vi.fn().mockResolvedValue({ approvalCall: out.approvalCall }), swap: vi.fn() };
}

describe("prepareSwap", () => {
  it("dispatches to tradingApi for chain 8453", async () => {
    const ta = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const dv = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const out = await prepareSwap({
      values: { amount: "0.1", assetIn: "ETH", assetOut: "USDC", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 18n), readContract: vi.fn() } as any,
    });
    expect(ta.quote).toHaveBeenCalled();
    expect(dv.quote).not.toHaveBeenCalled();
    expect(out.config.chainId).toBe(8453);
    expect(out.config.strategyTag).toBe("trading-api");
    expect(out.insufficient).toBe(false);
    expect(out.keeperOffers.length).toBeGreaterThan(0);
  });

  it("dispatches to directV3 for sepolia + sets liquidityNote", async () => {
    const ta = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const dv = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const out = await prepareSwap({
      values: { amount: "0.001", assetIn: "ETH", assetOut: "USDC", chain: "ethereum-sepolia" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 18n), readContract: vi.fn() } as any,
    });
    expect(dv.quote).toHaveBeenCalled();
    expect(out.config.strategyTag).toBe("direct-v3");
    expect(out.liquidityNote).toMatch(/sepolia/i);
  });

  it("rejects assetIn === assetOut", async () => {
    const ta = strategyStub({}); const dv = strategyStub({});
    await expect(prepareSwap({ values: { amount: "1", assetIn: "USDC", assetOut: "USDC", chain: "base" }, address: SWAPPER, slippageBps: 50, strategies: { tradingApi: ta as any, directV3: dv as any }, publicClient: {} as any })).rejects.toThrow(/different assets/);
  });

  it("flags insufficient when balance < amountIn", async () => {
    const ta = strategyStub({ quote: fakeQuote({ amountIn: "10" }), approvalCall: null });
    const dv = strategyStub({});
    const out = await prepareSwap({
      values: { amount: "10", assetIn: "ETH", assetOut: "USDC", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 17n), readContract: vi.fn() } as any,
    });
    expect(out.insufficient).toBe(true);
  });

  it("uses readContract.balanceOf for ERC-20 assetIn", async () => {
    const ta = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const dv = strategyStub({});
    const readContract = vi.fn().mockResolvedValue(50_000_000n); // 50 USDC
    await prepareSwap({
      values: { amount: "10", assetIn: "USDC", assetOut: "ETH", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn(), readContract } as any,
    });
    expect(readContract).toHaveBeenCalled();
  });
});
