import type { KeeperOffer, Prepared, SvmTxCall } from "@wishd/plugin-sdk";

export type JupiterSwapConfig = {
  caip2: string;
  swapper: string;
  inputMint: string;
  outputMint: string;
  assetIn: string;
  assetOut: string;
  amountAtomic: string;
  slippageBps: number;
  dynamicSlippage: boolean;
};

export type JupiterRouteHop = {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
  };
};

export type JupiterSwapQuote = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: JupiterRouteHop[];
  contextSlot: number;
  timeTaken: number;
};

export type JupiterSwapExtras = {
  config: JupiterSwapConfig;
  initialQuote: JupiterSwapQuote;
  initialQuoteAt: number;
  balance: string;
  insufficient: boolean;
  decimalsIn: number;
  decimalsOut: number;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
};

export type JupiterSwapPrepared = Prepared<JupiterSwapExtras>;
export type Call = SvmTxCall;
