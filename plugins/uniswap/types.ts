import type { Hex } from "viem";

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

export type Call = { to: Hex; data: Hex; value: Hex };

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

export type KeeperOffer = { title: string; desc: string; why?: string; featured?: boolean };

export type SwapPrepared = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  approvalCall: Call | null;
  balance: string;
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
};

export class SwapError extends Error {
  constructor(public code: "no_route" | "unsupported_routing" | "insufficient_balance" | "validation" | "upstream", message: string) {
    super(`[${code}] ${message}`);
  }
}
