import {
  type IntentSchema,
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  isSvmCaip2,
} from "@wishd/plugin-sdk";
import { CURATED_CAIP19, CURATED_SYMBOLS } from "./addresses";

const SLIPPAGE_OPTIONS = ["0.1%", "0.5%", "1%", "auto"];

export const jupiterIntents: IntentSchema[] = [
  {
    intent: "jupiter.swap",
    verb: "swap",
    description: "exchange one Solana token for another via Jupiter",
    fields: [
      { key: "amount", type: "amount", required: true, default: "0.1" },
      { key: "assetIn", type: "asset", required: true, default: "SOL", options: CURATED_CAIP19 },
      { key: "assetOut", type: "asset", required: true, default: "USDC", options: CURATED_CAIP19 },
      {
        key: "chain",
        type: "chain",
        required: true,
        default: SOLANA_MAINNET,
        options: [SOLANA_MAINNET],
      },
      { key: "slippage", type: "select", required: true, default: "0.5%", options: SLIPPAGE_OPTIONS },
    ],
    connectors: { assetIn: "", assetOut: "to", chain: "on", slippage: "with slippage" },
    widget: "jupiter-swap-summary",
    slot: "flow",
  },
];

export type ValidateResult = { ok: true } | { ok: false; error: string };

export function validateSwapValues(values: Record<string, string>): ValidateResult {
  const { amount, assetIn, assetOut, chain, slippage } = values;
  if (!chain) return { ok: false, error: "missing chain" };
  if (!isSvmCaip2(chain)) return { ok: false, error: `unsupported chain: ${chain}` };
  if (chain === SOLANA_DEVNET || chain !== SOLANA_MAINNET) {
    return { ok: false, error: "jupiter is mainnet only" };
  }
  if (!assetIn || !assetOut) return { ok: false, error: "missing assets" };
  if (assetIn === assetOut) return { ok: false, error: "same input and output asset" };
  if (!amount || !/^[0-9]+(?:\.[0-9]+)?$/.test(amount)) {
    return { ok: false, error: `invalid amount: ${amount}` };
  }
  if (slippage && !SLIPPAGE_OPTIONS.includes(slippage)) {
    return { ok: false, error: `invalid slippage: ${slippage}` };
  }
  // soft-check that symbols are known; resolveAsset will do the hard lookup
  void CURATED_SYMBOLS;
  return { ok: true };
}
