import type { IntentSchema } from "@wishd/plugin-sdk";
import { SOLANA_MAINNET, CURATED_SYMBOLS_EVM, CURATED_SYMBOLS_ALL } from "./addresses";

const SLIPPAGE_OPTIONS = ["0.1%", "0.5%", "1%"];

const EVM_CHAIN_OPTIONS = [
  "eip155:1",
  "eip155:8453",
  "eip155:42161",
  "eip155:10",
  "eip155:137",
];

export const lifiIntents: IntentSchema[] = [
  {
    intent: "lifi.bridge-swap",
    verb: "bridge",
    description: "bridge and optionally swap an asset across chains via Li.Fi",
    fields: [
      { key: "amount",    type: "amount", required: true,  default: "10" },
      { key: "assetIn",   type: "asset",  required: true,  default: "USDC",         options: [...CURATED_SYMBOLS_EVM] },
      { key: "fromChain", type: "chain",  required: true,  default: "eip155:1",     options: EVM_CHAIN_OPTIONS },
      { key: "assetOut",  type: "asset",  required: true,  default: "SOL",          options: [...CURATED_SYMBOLS_ALL] },
      { key: "toChain",   type: "chain",  required: true,  default: SOLANA_MAINNET, options: [...EVM_CHAIN_OPTIONS, SOLANA_MAINNET] },
      { key: "slippage",  type: "select", required: false, default: "0.5%",         options: SLIPPAGE_OPTIONS },
    ],
    connectors: {
      assetIn: "",
      fromChain: "on",
      assetOut: "to",
      toChain: "on",
      slippage: "with",
    },
    widget: "lifi-bridge-summary",
    slot: "flow",
  },
];

export type ValidateBridgeResult = { ok: true } | { ok: false; reason: string };

export function validateBridgeValues(values: {
  amount: string;
  assetIn: string;
  fromChain: string;
  assetOut: string;
  toChain: string;
  slippage?: string;
}): ValidateBridgeResult {
  const { amount, assetIn, fromChain, assetOut, toChain } = values;

  // Reject SVM as source chain
  if (fromChain.startsWith("solana:")) {
    return { ok: false, reason: "Source chain must be EVM. SVM source bridging is not supported in v1." };
  }

  // Reject identical asset on same chain
  if (fromChain === toChain && assetIn === assetOut) {
    return { ok: false, reason: "Same asset on same chain — no bridge needed." };
  }

  // Reject bad amounts
  if (!amount || amount.trim() === "") {
    return { ok: false, reason: "Amount is required." };
  }
  const num = Number(amount);
  if (isNaN(num) || num <= 0) {
    return { ok: false, reason: `Amount must be a positive number, got: ${amount}` };
  }

  return { ok: true };
}
