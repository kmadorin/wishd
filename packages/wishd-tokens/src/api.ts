import upstream from "@uniswap/default-token-list/build/uniswap-default.tokenlist.json";
import sepolia  from "./overrides/sepolia.tokenlist.json";
import { mergeTokenLists } from "./merge";
import { validateTokenList } from "./validate";
import { NATIVE_PLACEHOLDER } from "./native";
import type { Address, TokenInfo, TokenList } from "./types";

// Validate at module load — surfaces malformed overrides immediately.
validateTokenList(upstream as TokenList);
validateTokenList(sepolia  as TokenList);

const ALL: TokenInfo[] = mergeTokenLists(upstream as TokenList, sepolia as TokenList);

// Synthetic native asset entries — the upstream Uniswap token list does not include
// native assets (ETH, MATIC, etc.) with the zero placeholder address.
// We inject canonical entries so findByCaip19("eip155:1/slip44:60") etc. work.

type SyntheticNative = {
  chainId: number; symbol: string; name: string; decimals: number; slip44: number;
};

const EVM_NATIVES: SyntheticNative[] = [
  { chainId: 1,        symbol: "ETH",   name: "Ether",   decimals: 18, slip44: 60  },
  { chainId: 10,       symbol: "ETH",   name: "Ether",   decimals: 18, slip44: 60  },
  { chainId: 130,      symbol: "ETH",   name: "Ether",   decimals: 18, slip44: 60  },
  { chainId: 137,      symbol: "MATIC", name: "Polygon", decimals: 18, slip44: 966 },
  { chainId: 8453,     symbol: "ETH",   name: "Ether",   decimals: 18, slip44: 60  },
  { chainId: 42161,    symbol: "ETH",   name: "Ether",   decimals: 18, slip44: 60  },
  { chainId: 11155111, symbol: "ETH",   name: "Ether",   decimals: 18, slip44: 60  },
];

for (const n of EVM_NATIVES) {
  ALL.push({
    chainId: n.chainId,
    address: NATIVE_PLACEHOLDER,
    name: n.name,
    symbol: n.symbol,
    decimals: n.decimals,
    logoURI: "",
    caip19: `eip155:${n.chainId}/slip44:${n.slip44}`,
  } as TokenInfo);
}

// Synthetic SOL native entry.
// chainId=0 is a sentinel — Solana has no EVM chainId.
// address is the well-known wrapped SOL mint (canonical Solana native identifier).
const SOL_NATIVE: TokenInfo = {
  chainId: 0,
  address: "So11111111111111111111111111111111111111112",
  name: "Solana",
  symbol: "SOL",
  decimals: 9,
  logoURI: "",
  caip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
} as TokenInfo;
ALL.push(SOL_NATIVE);

const byChainSymbol  = new Map<string, TokenInfo>();
const byChainAddress = new Map<string, TokenInfo>();
const byCaip19       = new Map<string, TokenInfo>();
const chainIds       = new Set<number>();
for (const t of ALL) {
  byChainSymbol.set(`${t.chainId}:${t.symbol.toUpperCase()}`, t);
  byChainAddress.set(`${t.chainId}:${t.address.toLowerCase()}`, t);
  byCaip19.set(t.caip19, t);
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

/** Find a token by its CAIP-19 identifier (exact match). */
export function findByCaip19(caip19: string): TokenInfo | undefined {
  return byCaip19.get(caip19);
}

/**
 * List all tokens for a given CAIP-2 chain namespace.
 * For EVM chains, pass e.g. "eip155:1".
 * For Solana mainnet, pass "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp".
 */
export function listForChain(caip2: string): TokenInfo[] {
  return ALL.filter(t => t.caip19.startsWith(caip2 + "/"));
}
