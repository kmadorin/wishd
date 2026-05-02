import type { IntentSchema } from "@wishd/plugin-sdk";

export const SUPPORTED_CHAIN_SLUGS = [
  "ethereum", "base", "arbitrum", "optimism", "polygon", "unichain", "ethereum-sepolia",
] as const;

export const CHAIN_ID_BY_SLUG: Record<string, number> = {
  "ethereum":          1,
  "base":              8453,
  "arbitrum":          42161,
  "optimism":          10,
  "polygon":           137,
  "unichain":          130,
  "ethereum-sepolia":  11155111,
};

const ASSET_OPTIONS = ["ETH", "USDC", "USDT", "WETH", "DAI", "WBTC", "MATIC"];

export const uniswapIntents: IntentSchema[] = [{
  intent: "uniswap.swap",
  verb: "swap",
  description: "exchange one token for another",
  fields: [
    { key: "amount",   type: "amount", required: true, default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true, default: "ETH",  options: ASSET_OPTIONS },
    { key: "assetOut", type: "asset",  required: true, default: "USDC", options: ASSET_OPTIONS },
    { key: "chain",    type: "chain",  required: true, default: "ethereum-sepolia", options: [...SUPPORTED_CHAIN_SLUGS] },
  ],
  connectors: { assetIn: "", assetOut: "to", chain: "on" },
  widget: "swap-summary",
  slot: "flow",
}];

export function validateSwapValues(v: { amount: string; assetIn: string; assetOut: string; chain: string }): void {
  if (!CHAIN_ID_BY_SLUG[v.chain]) throw new Error(`unsupported chain: ${v.chain}`);
  if (v.assetIn === v.assetOut) throw new Error("pick two different assets");
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(v.amount)) throw new Error(`invalid amount: ${v.amount}`);
}

export type AssetSide = "in" | "out";
export type AssetPair = { assetIn: string; assetOut: string };

export function applyAssetChange(
  side: AssetSide,
  next: string,
  prev: AssetPair,
): AssetPair {
  if (side === "in") {
    if (next === prev.assetOut) return { assetIn: next, assetOut: prev.assetIn };
    return { assetIn: next, assetOut: prev.assetOut };
  }
  if (next === prev.assetIn) return { assetIn: prev.assetOut, assetOut: next };
  return { assetIn: prev.assetIn, assetOut: next };
}
