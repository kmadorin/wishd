// plugins/uniswap/prepare.ts
import type { Hex, PublicClient } from "viem";
import { parseUnits, formatUnits } from "viem";
import { EIP155 } from "@wishd/plugin-sdk";
import { TRADING_API_CHAINS } from "./addresses";
import { CHAIN_ID_BY_SLUG, CAIP2_BY_SLUG, validateSwapValues } from "./intents";
import { resolveAsset } from "./resolveAsset";
import { erc20Abi } from "./abis/erc20";
import type { SwapConfig, SwapPrepared, KeeperOffer, SwapQuote, Call, StrategyCall } from "./types";

const STATIC_KEEPER_OFFERS: KeeperOffer[] = [
  { title: "Earn on idle tokens",     desc: "Auto-deposit received tokens into best APY protocol.", featured: true },
  { title: "Range alert",             desc: "Notify if price moves ±15% — chance to swap back at better rate." },
  { title: "DCA back",                desc: "Drip tokens back at intervals until target allocation reached." },
  { title: "Liquidation protection",  desc: "Auto-repay borrow if health factor drops below 1.3." },
];


/** Convert a strategy-internal Call (value: Hex) to EvmCall (value: bigint) */
function toEvmCall(chainId: number, c: StrategyCall): Call {
  return {
    family: "evm",
    caip2: EIP155(chainId),
    to: c.to,
    data: c.data,
    value: BigInt(c.value),
  };
}

export type StrategyApi = {
  quote: (cfg: SwapConfig) => Promise<SwapQuote>;
  checkApproval: (i: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }) => Promise<{ approvalCall: StrategyCall | null }>;
  swap:  (i: { config: SwapConfig; quote: SwapQuote }) => Promise<{ swapCall: StrategyCall; approvalStillRequired: boolean }>;
};

export type Strategies = { tradingApi: StrategyApi; directV3: StrategyApi };

export type PrepareInput = {
  values: { amount: string; assetIn: string; assetOut: string; chain: string };
  address: Hex;
  slippageBps: number;
  strategies: Strategies;
  publicClient: Pick<PublicClient, "getBalance" | "readContract">;
};

/** Resolve chain slug or CAIP-2 string to a numeric chainId */
function resolveChainId(chain: string): number {
  // slug path
  if (CHAIN_ID_BY_SLUG[chain]) return CHAIN_ID_BY_SLUG[chain]!;
  // CAIP-2 path: find slug whose CAIP-2 matches
  const slug = Object.entries(CAIP2_BY_SLUG).find(([, c]) => c === chain)?.[0];
  if (slug) return CHAIN_ID_BY_SLUG[slug]!;
  throw new Error(`unsupported chain: ${chain}`);
}

export async function prepareSwap(input: PrepareInput): Promise<SwapPrepared> {
  validateSwapValues(input.values);
  const chainId = resolveChainId(input.values.chain);
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

  // Convert strategy approvalCall (Hex value) → EvmCall (bigint value)
  const evmApprovalCall: Call | null = approval.approvalCall
    ? toEvmCall(chainId, approval.approvalCall)
    : null;

  return {
    calls: [evmApprovalCall].filter((c): c is Call => c !== null),
    config,
    initialQuote: quote,
    initialQuoteAt: Date.now(),
    // keep approvalCall field for back-compat (intentDispatch.ts reads it directly)
    approvalCall: evmApprovalCall,
    balance,
    insufficient,
    liquidityNote: chainId === 11155111 ? "Sepolia liquidity is sparse — preview only, this may revert on execute." : undefined,
    keeperOffers: STATIC_KEEPER_OFFERS,
  } satisfies SwapPrepared;
}
