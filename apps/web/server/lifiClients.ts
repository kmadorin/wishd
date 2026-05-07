// apps/web/server/lifiClients.ts
// Server-side viem public clients + Li.Fi REST fetch helper.

import { createPublicClient, http } from "viem";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";

const CHAIN_BY_ID: Record<number, (typeof mainnet) | (typeof base) | (typeof arbitrum) | (typeof optimism) | (typeof polygon)> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

function rpcUrlFor(chainId: number): string | undefined {
  // Match repo convention used by uniswapClients.ts: RPC_URL_<chainId>
  return process.env[`RPC_URL_${chainId}`] ?? undefined;
}

/**
 * Returns a viem PublicClient for the given CAIP-2 EVM chain.
 * Reads per-chain RPC URL overrides from environment variables.
 * Throws for non-EVM or unsupported chains.
 */
export function evmPublicClientFor(caip2: string) {
  if (!caip2.startsWith("eip155:")) {
    throw new Error(`not an EVM chain: ${caip2}`);
  }
  const chainIdStr = caip2.slice("eip155:".length);
  const chainId = parseInt(chainIdStr, 10);
  const chain = CHAIN_BY_ID[chainId];
  if (!chain) {
    throw new Error(`unsupported chain: ${caip2}`);
  }
  const rpcUrl = rpcUrlFor(chainId);
  return createPublicClient({ chain, transport: http(rpcUrl, { timeout: 3500 }) });
}

export type LiFiFetchOptions = {
  search?: Record<string, string | number | boolean | undefined>;
  init?: RequestInit;
};

/**
 * Fetch from Li.Fi REST API.
 * - Builds URL: https://li.quest/v1<path>?<search params>
 * - Attaches `x-lifi-api-key` header if LIFI_API_KEY env var is set.
 * - Returns parsed JSON.
 * - Throws on non-2xx with message containing status code + body.
 */
export async function lifiFetch(path: string, options: LiFiFetchOptions): Promise<unknown> {
  const { search, init } = options;

  const url = new URL(`https://li.quest/v1${path}`);
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) {
    headers["x-lifi-api-key"] = apiKey;
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    // Try to extract a concise, user-actionable message from the Li.Fi body.
    // /quote failures often return {message, code, errors:[{overallPath, reason}, ...]}
    // where the errors array can be 100s of routes; surface only the top-level
    // message + the first reason. Fall back to truncated raw text.
    let summary = text;
    try {
      const j = JSON.parse(text) as { message?: string; code?: number; errors?: Array<{ reason?: string }> };
      const top = j.message ?? "";
      const first = j.errors?.find((e) => typeof e?.reason === "string")?.reason;
      if (top || first) {
        summary = first ? `${top} (${first})` : top;
      }
    } catch {
      if (text.length > 240) summary = `${text.slice(0, 240)}…`;
    }
    throw new Error(`Li.Fi ${res.status}: ${summary}`);
  }

  return res.json();
}
