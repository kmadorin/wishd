import type { Hex } from "viem";
import type { EvmCall, Prepared } from "@wishd/plugin-sdk";

export type Call = EvmCall;

/** Internal strategy call shape (value is Hex string, no family/caip2 yet). */
export type StrategyCall = { to: Hex; data: Hex; value: Hex };

export type SwapConfig = {
  chainId: number;
  swapper: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  assetIn: string;
  assetOut: string;
  amountIn: string;
  slippageBps: number;
  strategyTag: "trading-api" | "direct-v3";
};

export type SwapQuote = {
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  rate: string;
  route: string;
  gasFeeUSD?: string;
  networkFee?: string;
  priceImpactBps?: number;
  expiresAt: number;
  raw: unknown;
};

export type KeeperOffer = { title: string; desc: string; featured?: boolean };

export type SwapPreparedExtras = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  /** @deprecated use calls[0] instead; kept for one release for widget back-compat */
  approvalCall: Call | null;
  balance: string;
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
};

export type SwapPrepared = Prepared<SwapPreparedExtras>;

export class SwapError extends Error {
  constructor(public code: "no_route" | "unsupported_routing" | "insufficient_balance" | "validation" | "upstream", message: string) {
    super(`[${code}] ${message}`);
  }
}
