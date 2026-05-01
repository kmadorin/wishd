// plugins/uniswap/strategies/directV3.test.ts
import { describe, it, expect, vi } from "vitest";
import { directV3Strategy } from "./directV3";

const sepolia = 11155111;
const SWAPPER = "0x000000000000000000000000000000000000bEEF" as const;
const ETH = "0x0000000000000000000000000000000000000000" as const;
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

function mockClient({ outs, allowance }: { outs: Record<number, bigint>; allowance: bigint }) {
  const sim = vi.fn().mockImplementation((args: any) => {
    const fee = args.args[0].fee;
    const out = outs[fee];
    if (out === undefined) throw new Error("revert: no pool");
    return Promise.resolve({ result: [out, 0n, 0, 100_000n] });
  });
  const read = vi.fn().mockImplementation((args: any) => {
    if (args.functionName === "allowance") return Promise.resolve(allowance);
    if (args.functionName === "balanceOf") return Promise.resolve(10n ** 20n);
    throw new Error("unexpected read");
  });
  return { simulateContract: sim, readContract: read, getBalance: vi.fn().mockResolvedValue(5n * 10n ** 18n) } as any;
}

describe("directV3Strategy", () => {
  it("picks best fee tier across 500/3000/10000", async () => {
    const client = mockClient({ outs: { 500: 100n, 3000: 200n, 10000: 50n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    const q = await s.quote({ chainId: sepolia, swapper: SWAPPER, tokenIn: ETH, tokenOut: SEPOLIA_USDC, amountIn: "0.001", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" });
    expect(q.route).toContain("0.30%");
    expect(BigInt((q.raw as any).amountOutMin)).toBe(200n * 9950n / 10000n);
  });

  it("throws no_route when all fee tiers revert", async () => {
    const client = mockClient({ outs: {}, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    await expect(s.quote({ chainId: sepolia, swapper: SWAPPER, tokenIn: ETH, tokenOut: SEPOLIA_USDC, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" })).rejects.toThrow(/no_route/);
  });

  it("checkApproval — null for ETH-in, allowance read for ERC20", async () => {
    const client = mockClient({ outs: { 3000: 1n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    expect(await s.checkApproval({ chainId: sepolia, walletAddress: SWAPPER, token: ETH, amountWei: "1" })).toEqual({ approvalCall: null });
    const r = await s.checkApproval({ chainId: sepolia, walletAddress: SWAPPER, token: SEPOLIA_USDC, amountWei: "10000000" });
    expect(r.approvalCall).not.toBeNull();
    expect(r.approvalCall!.data.startsWith("0x095ea7b3")).toBe(true);
  });

  it("swap — ETH-in returns multicall with non-zero value", async () => {
    const client = mockClient({ outs: { 3000: 200n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    const cfg = { chainId: sepolia, swapper: SWAPPER, tokenIn: ETH, tokenOut: SEPOLIA_USDC, amountIn: "0.001", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" as const };
    const q = await s.quote(cfg);
    const out = await s.swap({ config: cfg, quote: q });
    expect(BigInt(out.swapCall.value)).toBeGreaterThan(0n);
    expect(out.swapCall.data.startsWith("0xac9650d8")).toBe(true); // multicall(bytes[]) selector
  });
});
