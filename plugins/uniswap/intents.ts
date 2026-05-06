import { type IntentSchema, EIP155 } from "@wishd/plugin-sdk";

export const SUPPORTED_CHAIN_SLUGS = [
  "ethereum", "base", "arbitrum", "optimism", "polygon", "unichain", "ethereum-sepolia",
] as const;

export const CHAIN_ID_BY_SLUG: Record<string, number> = {
  "ethereum":         1,
  "base":             8453,
  "arbitrum":         42161,
  "optimism":         10,
  "polygon":          137,
  "unichain":         130,
  "ethereum-sepolia": 11155111,
};

export const CAIP2_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CHAIN_ID_BY_SLUG).map(([slug, id]) => [slug, EIP155(id)]),
);

const ASSET_OPTIONS = ["ETH", "USDC", "USDT", "WETH", "DAI", "WBTC", "MATIC"];

export const uniswapIntents: IntentSchema[] = [{
  intent: "uniswap.swap",
  verb: "swap",
  description: "exchange one token for another",
  fields: [
    { key: "amount",   type: "amount", required: true, default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true, default: "ETH",  options: ASSET_OPTIONS },
    { key: "assetOut", type: "asset",  required: true, default: "USDC", options: ASSET_OPTIONS },
    {
      key: "chain", type: "chain", required: true,
      default: CAIP2_BY_SLUG["ethereum-sepolia"]!,
      options: SUPPORTED_CHAIN_SLUGS.map((s) => CAIP2_BY_SLUG[s]!),
    },
  ],
  connectors: { assetIn: "", assetOut: "to", chain: "on" },
  widget: "swap-summary",
  slot: "flow",
}];

export function validateSwapValues(v: { amount: string; assetIn: string; assetOut: string; chain: string }): void {
  // accept either CAIP-2 or legacy slug for one release
  const slugById = (caip2: string) =>
    Object.entries(CAIP2_BY_SLUG).find(([, c]) => c === caip2)?.[0];
  const slug = CHAIN_ID_BY_SLUG[v.chain] ? v.chain : slugById(v.chain);
  if (!slug || !CHAIN_ID_BY_SLUG[slug]) throw new Error(`unsupported chain: ${v.chain}`);
  if (v.assetIn === v.assetOut) throw new Error("pick two different assets");
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(v.amount)) throw new Error(`invalid amount: ${v.amount}`);
}
