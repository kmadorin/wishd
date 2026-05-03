// plugins/uniswap/prepare.ts
import type { Hex, PublicClient } from "viem";
import { parseUnits, formatUnits } from "viem";
import { TRADING_API_CHAINS } from "./addresses";
import { CHAIN_ID_BY_SLUG, validateSwapValues } from "./intents";
import { resolveAsset } from "./resolveAsset";
import { erc20Abi } from "./abis/erc20";
import type { SwapConfig, SwapPrepared, KeeperOffer, SwapQuote, Call } from "./types";

const STATIC_KEEPER_OFFERS: KeeperOffer[] = [
  {
    title: "Earn on idle tokens",
    desc: "Auto-deposit received tokens into best APY protocol.",
    why: "Your received tokens sit idle in the wallet — auto-supply on Compound earns ~3% APY without further clicks.",
    featured: true,
  },
  {
    title: "Range alert",
    desc: "Notify if price moves ±15% — chance to swap back at better rate.",
    why: "Volatile pair: a swing the other way is a free re-entry; we'll ping you so you don't have to watch the chart.",
  },
];

export type StrategyApi = {
  quote: (cfg: SwapConfig) => Promise<SwapQuote>;
  checkApproval: (i: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }) => Promise<{ approvalCall: Call | null }>;
  swap: (i: { config: SwapConfig; quote: SwapQuote }) => Promise<{ swapCall: Call; approvalStillRequired: boolean }>;
};

export type Strategies = { tradingApi: StrategyApi; directV3: StrategyApi };

export type PrepareInput = {
  values: { amount: string; assetIn: string; assetOut: string; chain: string };
  address: Hex;
  slippageBps: number;
  strategies: Strategies;
  publicClient: Pick<PublicClient, "getBalance" | "readContract">;
};

export async function prepareSwap(input: PrepareInput): Promise<SwapPrepared> {
  validateSwapValues(input.values);
  const chainId = CHAIN_ID_BY_SLUG[input.values.chain]!;
  const aIn  = resolveAsset(chainId, input.values.assetIn);
  const aOut = resolveAsset(chainId, input.values.assetOut);

  const strategyTag: SwapConfig["strategyTag"] = TRADING_API_CHAINS.has(chainId) ? "trading-api" : "direct-v3";
  const strategy = strategyTag === "trading-api" ? input.strategies.tradingApi : input.strategies.directV3;

  const amountInWei = parseUnits(input.values.amount, aIn.decimals);

  const config: SwapConfig = {
    chainId, swapper: input.address,
    tokenIn:  aIn.address,
    tokenOut: aOut.address,
    assetIn:  input.values.assetIn,
    assetOut: input.values.assetOut,
    amountIn: strategyTag === "trading-api" ? amountInWei.toString() : input.values.amount,
    slippageBps: input.slippageBps,
    strategyTag,
  };

  const balanceP = aIn.isNative
    ? input.publicClient.getBalance({ address: input.address })
    : input.publicClient.readContract({ address: aIn.address, abi: erc20Abi, functionName: "balanceOf", args: [input.address] }) as Promise<bigint>;

  const [balanceWei, quote, approval] = await Promise.all([
    balanceP,
    strategy.quote(config),
    strategy.checkApproval({ chainId, walletAddress: input.address, token: aIn.address, amountWei: amountInWei.toString() }),
  ]);

  const balance = formatUnits(balanceWei as bigint, aIn.decimals);
  const insufficient = (balanceWei as bigint) < amountInWei;

  return {
    config,
    initialQuote: quote,
    initialQuoteAt: Date.now(),
    approvalCall: approval.approvalCall,
    balance,
    insufficient,
    liquidityNote: chainId === 11155111 ? "Sepolia liquidity is sparse — preview only, this may revert on execute." : undefined,
    keeperOffers: STATIC_KEEPER_OFFERS,
  };
}
