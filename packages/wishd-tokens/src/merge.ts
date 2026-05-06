import type { TokenInfo as UniswapTokenInfo } from "@uniswap/token-lists/src/types";
import type { TokenInfo, TokenList } from "./types";
import { NATIVE_PLACEHOLDER } from "./native";

// SLIP-44 coin type for native assets per chain.
// Polygon (137) uses coin type 966 (MATIC); all other EVM chains use 60 (ETH).
function slip44(chainId: number): number {
  return chainId === 137 ? 966 : 60;
}

function synthCaip19(chainId: number, address: string): string {
  if (address.toLowerCase() === NATIVE_PLACEHOLDER.toLowerCase()) {
    return `eip155:${chainId}/slip44:${slip44(chainId)}`;
  }
  return `eip155:${chainId}/erc20:${address.toLowerCase()}`;
}

function withCaip19(t: UniswapTokenInfo): TokenInfo {
  return { ...t, caip19: synthCaip19(t.chainId, t.address) };
}

export function mergeTokenLists(base: TokenList, ...overrides: TokenList[]): TokenInfo[] {
  const map = new Map<string, TokenInfo>();
  const key = (t: UniswapTokenInfo) => `${t.chainId}:${t.address.toLowerCase()}`;
  for (const t of base.tokens) map.set(key(t), withCaip19(t));
  for (const o of overrides) {
    for (const t of o.tokens) map.set(key(t), withCaip19(t));  // overrides win
  }
  return [...map.values()];
}
