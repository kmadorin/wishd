import type { Prepared } from "@wishd/plugin-sdk";

// Re-export convenience types from SDK
export type { LifiStatusObservation, Placeholder } from "@wishd/plugin-sdk";
export type { EvmCall } from "@wishd/plugin-sdk";

export type LifiBridgeStatus = "PENDING" | "DONE" | "FAILED" | "INVALID" | "TIMEOUT";

export type LifiBridgeConfig = {
  fromCaip2: string;        // eip155:*
  toCaip2: string;          // eip155:* | solana:*
  fromAddress: string;      // signer
  toAddress: string;        // recipient
  assetInCaip19: string;
  assetOutCaip19: string;
  amountAtomic: string;     // u64/u256 stringified
  slippage: number;         // 0.005 etc.
};

export type LifiQuoteEstimate = {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress: string | null;
  feeCosts: Array<{
    name: string;
    description: string;
    amountUSD: string;
    included: boolean;
  }>;
  gasCosts: Array<{
    type: string;
    amountUSD: string;
    estimate: string;
  }>;
  executionDuration: number;  // seconds
  steps: Array<{
    tool: string;
    toolDetails: { name: string; logoURI: string };
    type: string;
  }>;
};

export type LifiBridgeExtras = {
  config: LifiBridgeConfig;
  quote: LifiQuoteEstimate;
  quoteAt: number;
  insufficient: boolean;
  balance: string;              // human (decimals applied)
  routeNote?: string;           // e.g. "Routed via Across + Wormhole (2 hops)"
  totalFeeUSD: string;          // sum of feeCosts where included=true
  totalGasUSD: string;
  estimatedDurationSec: number;
};

export type LifiBridgePrepared = Prepared<LifiBridgeExtras>;

export type LifiStatusResponse = {
  status: LifiBridgeStatus;
  substatus?: string;
  sending?: {
    txHash?: string;
    chainId?: string | number;
    amount?: string;
    token?: { symbol: string; decimals: number };
  };
  receiving?: {
    txHash?: string;
    chainId?: string | number;
    amount?: string;
    token?: { symbol: string; decimals: number };
  };
  bridgeExplorerLink?: string;
};
