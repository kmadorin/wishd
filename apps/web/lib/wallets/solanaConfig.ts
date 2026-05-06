import type { SolanaClientConfig } from "@solana/client";

const SOLANA_MAINNET_CHAIN_ID = "1151111081099710";

export function getSolanaClientConfig(): SolanaClientConfig {
  const rpc = readRpc();
  return {
    cluster: "mainnet",
    ...(rpc ? { endpoint: rpc as `https://${string}` } : {}),
  };
}

function readRpc(): string | undefined {
  const direct = process.env.NEXT_PUBLIC_SOLANA_RPC_URI;
  if (direct) return direct;
  const raw = process.env.NEXT_PUBLIC_CUSTOM_RPCS;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, string[] | undefined>;
    const list = parsed[SOLANA_MAINNET_CHAIN_ID];
    return Array.isArray(list) && list.length > 0 ? list[0] : undefined;
  } catch {
    return undefined;
  }
}
