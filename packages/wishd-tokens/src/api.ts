import upstream from "@uniswap/default-token-list/build/uniswap-default.tokenlist.json";
import sepolia  from "./overrides/sepolia.tokenlist.json";
import { mergeTokenLists } from "./merge";
import { validateTokenList } from "./validate";
import type { Address, TokenInfo, TokenList } from "./types";

// Validate at module load — surfaces malformed overrides immediately.
validateTokenList(upstream as TokenList);
validateTokenList(sepolia  as TokenList);

const ALL: TokenInfo[] = mergeTokenLists(upstream as TokenList, sepolia as TokenList);

const byChainSymbol  = new Map<string, TokenInfo>();
const byChainAddress = new Map<string, TokenInfo>();
const chainIds       = new Set<number>();
for (const t of ALL) {
  byChainSymbol.set(`${t.chainId}:${t.symbol.toUpperCase()}`, t);
  byChainAddress.set(`${t.chainId}:${t.address.toLowerCase()}`, t);
  chainIds.add(t.chainId);
}

export function getToken(chainId: number, symbol: string): TokenInfo | undefined {
  return byChainSymbol.get(`${chainId}:${symbol.toUpperCase()}`);
}

export function getTokens(chainId: number): TokenInfo[] {
  return ALL.filter(t => t.chainId === chainId);
}

export function findByAddress(chainId: number, address: Address): TokenInfo | undefined {
  return byChainAddress.get(`${chainId}:${address.toLowerCase()}`);
}

export function listChains(): number[] {
  return [...chainIds].sort((a, b) => a - b);
}
