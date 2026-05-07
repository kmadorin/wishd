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

const RPC_ENV_BY_CHAIN_ID: Record<number, string> = {
  1: "ETHEREUM_RPC_URL",
  8453: "BASE_RPC_URL",
  42161: "ARBITRUM_RPC_URL",
  10: "OPTIMISM_RPC_URL",
  137: "POLYGON_RPC_URL",
};

function rpcUrlFor(chainId: number): string | undefined {
  const envKey = RPC_ENV_BY_CHAIN_ID[chainId];
  if (envKey) {
    return process.env[envKey] ?? undefined;
  }
  return undefined;
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
  const rpcUrl = rpcUrlFor(chainId) ?? undefined;
  return createPublicClient({ chain, transport: http(rpcUrl) });
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
    throw new Error(`Li.Fi ${res.status}: ${text}`);
  }

  return res.json();
}
