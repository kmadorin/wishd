import { SOLANA_MAINNET as SDK_SOLANA_MAINNET } from "@wishd/plugin-sdk";

export const SOLANA_MAINNET = SDK_SOLANA_MAINNET;

export const EVM_CHAINS = [
  "eip155:1",
  "eip155:8453",
  "eip155:42161",
  "eip155:10",
  "eip155:137",
] as const;

export const ALL_CHAINS = [...EVM_CHAINS, SOLANA_MAINNET] as const;

export const NATIVE_EVM_MARKER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export type CuratedAsset = {
  caip2: string;
  symbol: string;
  address: string;
  decimals: number;
  isNative: boolean;
};

// Helper to build ERC-20 CAIP-19
const erc20Caip19 = (caip2: string, addr: string) => `${caip2}/erc20:${addr}`;
// Helper to build SPL token CAIP-19
const splCaip19 = (mint: string) => `${SOLANA_MAINNET}/token:${mint}`;
// Native EVM CAIP-19 (slip44:60 = ETH)
const nativeEvmCaip19 = (caip2: string) => `${caip2}/slip44:60`;
// Native SOL CAIP-19 (slip44:501 = SOL)
const NATIVE_SOL_CAIP19 = `${SOLANA_MAINNET}/slip44:501`;

// USDC addresses per chain
const USDC_ADDR: Record<string, string> = {
  "eip155:1":     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "eip155:8453":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "eip155:10":    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  "eip155:137":   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

// USDT addresses per chain
const USDT_ADDR: Record<string, string> = {
  "eip155:1":     "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "eip155:42161": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  "eip155:137":   "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
};

// MATIC on Polygon (native)
// On Polygon, MATIC is native. On Ethereum, MATIC is ERC-20
const MATIC_EVM = {
  "eip155:137": { address: NATIVE_EVM_MARKER, isNative: true, decimals: 18 },
  "eip155:1":   { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", isNative: false, decimals: 18 },
};

// JitoSOL mint
const JITOSOL_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
const USDC_SOL_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const CURATED_ASSETS: Record<string, CuratedAsset> = {};

// Populate ETH entries for each EVM chain
for (const caip2 of EVM_CHAINS) {
  const caip19 = nativeEvmCaip19(caip2);
  CURATED_ASSETS[caip19] = { caip2, symbol: "ETH", address: NATIVE_EVM_MARKER, decimals: 18, isNative: true };
}

// Populate USDC entries for each EVM chain
for (const [caip2, addr] of Object.entries(USDC_ADDR)) {
  const caip19 = erc20Caip19(caip2, addr);
  CURATED_ASSETS[caip19] = { caip2, symbol: "USDC", address: addr, decimals: 6, isNative: false };
}

// Populate USDT entries
for (const [caip2, addr] of Object.entries(USDT_ADDR)) {
  const caip19 = erc20Caip19(caip2, addr);
  CURATED_ASSETS[caip19] = { caip2, symbol: "USDT", address: addr, decimals: 6, isNative: false };
}

// MATIC on Polygon (native)
{
  const caip2 = "eip155:137";
  const caip19 = nativeEvmCaip19(caip2);
  // MATIC on Polygon replaces ETH native slot (Polygon's native token is MATIC/POL)
  CURATED_ASSETS[caip19] = { caip2, symbol: "MATIC", address: NATIVE_EVM_MARKER, decimals: 18, isNative: true };
}

// MATIC on Ethereum (ERC-20)
{
  const caip2 = "eip155:1";
  const addr = "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0";
  const caip19 = erc20Caip19(caip2, addr);
  CURATED_ASSETS[caip19] = { caip2, symbol: "MATIC", address: addr, decimals: 18, isNative: false };
}

// SOL (native) on Solana mainnet
CURATED_ASSETS[NATIVE_SOL_CAIP19] = {
  caip2: SOLANA_MAINNET,
  symbol: "SOL",
  address: WSOL_MINT,
  decimals: 9,
  isNative: true,
};

// USDC on Solana mainnet
{
  const caip19 = splCaip19(USDC_SOL_MINT);
  CURATED_ASSETS[caip19] = {
    caip2: SOLANA_MAINNET,
    symbol: "USDC",
    address: USDC_SOL_MINT,
    decimals: 6,
    isNative: false,
  };
}

// JitoSOL on Solana mainnet
{
  const caip19 = splCaip19(JITOSOL_MINT);
  CURATED_ASSETS[caip19] = {
    caip2: SOLANA_MAINNET,
    symbol: "JitoSOL",
    address: JITOSOL_MINT,
    decimals: 9,
    isNative: false,
  };
}

export const CURATED_SYMBOLS_EVM = ["ETH", "USDC", "USDT", "MATIC"] as const;
export const CURATED_SYMBOLS_ALL = ["ETH", "USDC", "USDT", "MATIC", "SOL", "JitoSOL"] as const;

/**
 * Look up a curated asset by (caip2, symbol). Symbol is uppercased for comparison.
 * Returns the CAIP-19 string if found, else undefined.
 */
export function caip19For(caip2: string, symbol: string): string | undefined {
  const upper = symbol.toUpperCase();
  for (const [caip19, asset] of Object.entries(CURATED_ASSETS)) {
    if (asset.caip2 === caip2 && asset.symbol.toUpperCase() === upper) {
      return caip19;
    }
  }
  return undefined;
}
