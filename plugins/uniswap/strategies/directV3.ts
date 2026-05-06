// plugins/uniswap/strategies/directV3.ts
import { encodeFunctionData, parseUnits, formatUnits, maxUint256, type Hex, type PublicClient } from "viem";
import { getNative } from "@wishd/tokens";
import { DIRECT_V3_CHAINS } from "../addresses";
import { quoterV2Abi } from "../abis/quoterV2";
import { swapRouter02Abi } from "../abis/swapRouter02";
import { erc20Abi } from "../abis/erc20";
import { resolveAsset } from "../resolveAsset";
import type { StrategyCall, SwapConfig, SwapQuote } from "../types";
import { SwapError } from "../types";

const ETH = "0x0000000000000000000000000000000000000000" as Hex;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Hex; // SwapRouter02 sentinel for "this contract"
const FEES = [500, 3000, 10_000] as const;

export function directV3Strategy(opts: { publicClient: Pick<PublicClient, "simulateContract" | "readContract" | "getBalance"> }) {
  const pc = opts.publicClient;

  function chain(chainId: number) {
    const c = DIRECT_V3_CHAINS[chainId];
    if (!c) throw new SwapError("validation", `direct-v3 not configured for chain ${chainId}`);
    return c;
  }

  function wrapNative(addr: Hex, chainId: number): Hex {
    if (addr.toLowerCase() !== ETH) return addr;
    const n = getNative(chainId);
    if (!n) throw new SwapError("validation", `no native for chain ${chainId}`);
    return resolveAsset(chainId, n.wrappedSymbol).address;
  }

  async function quote(cfg: SwapConfig): Promise<SwapQuote> {
    const c = chain(cfg.chainId);
    const tIn  = wrapNative(cfg.tokenIn,  cfg.chainId);
    const tOut = wrapNative(cfg.tokenOut, cfg.chainId);
    const decIn  = resolveAsset(cfg.chainId, cfg.assetIn).decimals;
    const decOut = resolveAsset(cfg.chainId, cfg.assetOut).decimals;
    const amountInWei = parseUnits(cfg.amountIn, decIn);

    const settled = await Promise.allSettled(FEES.map((fee) => Promise.resolve().then(() => pc.simulateContract({
      address: c.quoterV2, abi: quoterV2Abi, functionName: "quoteExactInputSingle",
      args: [{ tokenIn: tIn, tokenOut: tOut, fee, amountIn: amountInWei, sqrtPriceLimitX96: 0n }],
    }))));

    const candidates = settled.flatMap((r, i) => {
      if (r.status !== "fulfilled") return [];
      const out = ((r as PromiseFulfilledResult<{ result: readonly [bigint, bigint, number, bigint] }>).value.result)[0];
      return [{ fee: FEES[i]!, out }];
    });
    const best = candidates.reduce<{ fee: number; out: bigint } | null>((b, c) => (!b || c.out > b.out ? c : b), null);
    if (!best) throw new SwapError("no_route", `no V3 pool for ${cfg.assetIn}/${cfg.assetOut} on chain ${cfg.chainId}`);

    const amountOutMin = (best.out * BigInt(10_000 - cfg.slippageBps)) / 10_000n;
    return {
      amountIn:     cfg.amountIn,
      amountOut:    formatUnits(best.out, decOut),
      amountOutMin: formatUnits(amountOutMin, decOut),
      rate:         `1 ${cfg.assetIn} = ${formatUnits(best.out * 10n ** BigInt(decIn) / amountInWei, decOut)} ${cfg.assetOut}`,
      route:        `Uniswap v3 · ${(best.fee / 10_000).toFixed(2)}%`,
      expiresAt:    Date.now() + 30_000,
      raw:          { fee: best.fee, amountInWei: amountInWei.toString(), amountOutMin: amountOutMin.toString(), wrapEthIn: cfg.tokenIn.toLowerCase() === ETH, unwrapWethOut: cfg.tokenOut.toLowerCase() === ETH },
    };
  }

  async function checkApproval(input: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }): Promise<{ approvalCall: StrategyCall | null }> {
    if (input.token.toLowerCase() === ETH) return { approvalCall: null };
    const c = chain(input.chainId);
    const allowance = await pc.readContract({ address: input.token, abi: erc20Abi, functionName: "allowance", args: [input.walletAddress, c.swapRouter02] }) as bigint;
    if (allowance >= BigInt(input.amountWei)) return { approvalCall: null };
    return { approvalCall: { to: input.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [c.swapRouter02, maxUint256] }), value: "0x0" as Hex } };
  }

  async function swap(input: { config: SwapConfig; quote: SwapQuote }): Promise<{ swapCall: StrategyCall; approvalStillRequired: boolean }> {
    const cfg = input.config;
    const raw = input.quote.raw as { fee: number; amountInWei: string; amountOutMin: string; wrapEthIn: boolean; unwrapWethOut: boolean };
    const c = chain(cfg.chainId);

    const recipient = raw.unwrapWethOut ? ADDRESS_THIS : cfg.swapper;
    const exactInputSingle = encodeFunctionData({
      abi: swapRouter02Abi, functionName: "exactInputSingle",
      args: [{ tokenIn: wrapNative(cfg.tokenIn, cfg.chainId), tokenOut: wrapNative(cfg.tokenOut, cfg.chainId), fee: raw.fee, recipient, amountIn: BigInt(raw.amountInWei), amountOutMinimum: BigInt(raw.amountOutMin), sqrtPriceLimitX96: 0n }],
    });

    const inner: Hex[] = [exactInputSingle];
    if (raw.unwrapWethOut) inner.push(encodeFunctionData({ abi: swapRouter02Abi, functionName: "unwrapWETH9", args: [BigInt(raw.amountOutMin), cfg.swapper] }));
    if (raw.wrapEthIn)     inner.push(encodeFunctionData({ abi: swapRouter02Abi, functionName: "refundETH", args: [] }));

    const data = encodeFunctionData({ abi: swapRouter02Abi, functionName: "multicall", args: [inner] });
    const value = (raw.wrapEthIn ? `0x${BigInt(raw.amountInWei).toString(16)}` : "0x0") as Hex;

    const swapCall: StrategyCall = { to: c.swapRouter02, data, value };
    const ap = await checkApproval({ chainId: cfg.chainId, walletAddress: cfg.swapper, token: cfg.tokenIn, amountWei: raw.amountInWei });
    return { swapCall, approvalStillRequired: ap.approvalCall !== null };
  }

  return { quote, checkApproval, swap };
}
