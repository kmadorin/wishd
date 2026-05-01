import type { TokenInfo, TokenList } from "./types";

export function mergeTokenLists(base: TokenList, ...overrides: TokenList[]): TokenInfo[] {
  const map = new Map<string, TokenInfo>();
  const key = (t: TokenInfo) => `${t.chainId}:${t.address.toLowerCase()}`;
  for (const t of base.tokens) map.set(key(t), t);
  for (const o of overrides) {
    for (const t of o.tokens) map.set(key(t), t);     // overrides win
  }
  return [...map.values()];
}
