import { CURATED_MINTS, JUPITER_TOKEN_LIST_URL } from "./addresses";

export type ResolvedAsset = {
  mint: string;
  decimals: number;
  isNative: boolean;
};

type JupiterTokenListEntry = {
  address: string;
  symbol: string;
  decimals: number;
};

const symbolCache = new Map<string, ResolvedAsset>();
const TTL_MS = 60 * 60 * 1000;
let listCache: { fetchedAt: number; entries: JupiterTokenListEntry[] } | null = null;

export function _resetForTest(): void {
  symbolCache.clear();
  listCache = null;
}

async function loadJupiterList(): Promise<JupiterTokenListEntry[]> {
  if (listCache && Date.now() - listCache.fetchedAt < TTL_MS) return listCache.entries;
  const res = await fetch(JUPITER_TOKEN_LIST_URL);
  if (!res.ok) throw new Error(`jupiter token list fetch failed: ${res.status}`);
  const entries = (await res.json()) as JupiterTokenListEntry[];
  listCache = { fetchedAt: Date.now(), entries };
  return entries;
}

export async function resolveAsset(caip2: string, symbol: string): Promise<ResolvedAsset> {
  const upper = symbol.toUpperCase();
  const cacheKey = `${caip2}:${upper}`;
  const cached = symbolCache.get(cacheKey);
  if (cached) return cached;

  // 1. curated (case-sensitive original symbol; some are mixed-case e.g. mSOL, jupSOL)
  const curated = CURATED_MINTS[symbol] ?? CURATED_MINTS[upper];
  if (curated) {
    const r: ResolvedAsset = { mint: curated.mint, decimals: curated.decimals, isNative: curated.isNative };
    symbolCache.set(cacheKey, r);
    return r;
  }

  // 2. Jupiter token list fallback
  const list = await loadJupiterList();
  const hit = list.find((t) => t.symbol.toUpperCase() === upper);
  if (hit) {
    const r: ResolvedAsset = { mint: hit.address, decimals: hit.decimals, isNative: false };
    symbolCache.set(cacheKey, r);
    return r;
  }

  throw new Error(`unknown asset on ${caip2}: ${symbol}`);
}
