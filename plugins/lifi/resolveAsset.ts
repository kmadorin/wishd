import { CURATED_ASSETS, caip19For, SOLANA_MAINNET } from "./addresses";

export type ResolvedAsset = {
  caip19: string;
  address: string;
  decimals: number;
  isNative: boolean;
};

const LIFI_TOKENS_URL = "https://li.quest/v1/tokens";
const JUPITER_TOKEN_LIST_URL = "https://tokens.jup.ag/tokens?tags=verified";

// Module-level LRU caches
const evmTokenCache = new Map<number, { fetchedAt: number; tokens: Array<{ address: string; symbol: string; decimals: number; chainId: number }> }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function loadLifiTokensForChain(chainId: number): Promise<Array<{ address: string; symbol: string; decimals: number; chainId: number }>> {
  const cached = evmTokenCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tokens;
  }
  const res = await fetch(`${LIFI_TOKENS_URL}?chains=${chainId}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Li.Fi tokens fetch failed: ${res.status}`);
  const data = await res.json() as { tokens: Record<string, Array<{ address: string; symbol: string; decimals: number; chainId: number }>> };
  const tokens = data.tokens[String(chainId)] ?? [];
  evmTokenCache.set(chainId, { fetchedAt: Date.now(), tokens });
  return tokens;
}

export function _resetForTest(): void {
  evmTokenCache.clear();
}

export async function resolveAsset(caip2: string, symbol: string): Promise<ResolvedAsset> {
  const upper = symbol.toUpperCase();

  // Step 1: Check curated assets
  const caip19 = caip19For(caip2, upper) ?? caip19For(caip2, symbol);
  if (caip19) {
    const asset = CURATED_ASSETS[caip19]!;
    return {
      caip19,
      address: asset.address,
      decimals: asset.decimals,
      isNative: asset.isNative,
    };
  }

  // Step 2: Best-effort @wishd/tokens lookup
  try {
    const { findByCaip19 } = await import("@wishd/tokens");
    if (typeof findByCaip19 === "function") {
      // findByCaip19 needs a CAIP-19 string but we have (caip2, symbol) — skip this fallback unless
      // a different lookup is available. Silently ignore.
    }
  } catch {
    // @wishd/tokens may not export findByCaip19 — ignore
  }

  // Step 3: Family branch
  if (caip2.startsWith("eip155:")) {
    // EVM: fetch from Li.Fi tokens API
    const chainId = Number(caip2.slice("eip155:".length));
    const tokens = await loadLifiTokensForChain(chainId);
    const hit = tokens.find((t) => t.symbol.toUpperCase() === upper);
    if (hit) {
      return {
        caip19: `${caip2}/erc20:${hit.address}`,
        address: hit.address,
        decimals: hit.decimals,
        isNative: false,
      };
    }
  } else if (caip2.startsWith("solana:")) {
    // SVM: try Jupiter plugin resolver
    try {
      const { resolveAsset: jupiterResolveAsset } = await import("@wishd/plugin-jupiter/resolveAsset");
      const result = await jupiterResolveAsset(caip2, symbol);
      return {
        caip19: `${SOLANA_MAINNET}/token:${result.mint}`,
        address: result.mint,
        decimals: result.decimals,
        isNative: result.isNative,
      };
    } catch {
      // Jupiter resolver failed — fall through to error
    }

    // SVM fallback: fetch from Jupiter token list directly
    try {
      const res = await fetch(JUPITER_TOKEN_LIST_URL);
      if (res.ok) {
        const tokens = await res.json() as Array<{ address: string; symbol: string; decimals: number }>;
        const hit = tokens.find((t) => t.symbol.toUpperCase() === upper);
        if (hit) {
          return {
            caip19: `${SOLANA_MAINNET}/token:${hit.address}`,
            address: hit.address,
            decimals: hit.decimals,
            isNative: false,
          };
        }
      }
    } catch {
      // fallback failed
    }
  }

  // Step 4: Total miss
  throw new Error(`unknown asset ${symbol} on ${caip2}`);
}
