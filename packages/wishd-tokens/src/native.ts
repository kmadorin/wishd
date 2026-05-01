import type { Address } from "./types";

export const NATIVE_PLACEHOLDER: Address = "0x0000000000000000000000000000000000000000";

export type NativeInfo = { chainId: number; symbol: string; decimals: number; wrappedSymbol: string };

const NATIVE: Record<number, NativeInfo> = {
  1:        { chainId: 1,        symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"   },
  10:       { chainId: 10,       symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"   },
  130:      { chainId: 130,      symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"   },
  137:      { chainId: 137,      symbol: "MATIC", decimals: 18, wrappedSymbol: "WMATIC" },
  8453:     { chainId: 8453,     symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"   },
  42161:    { chainId: 42161,    symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"   },
  11155111: { chainId: 11155111, symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"   },
};

export function getNative(chainId: number): NativeInfo | undefined {
  return NATIVE[chainId];
}
