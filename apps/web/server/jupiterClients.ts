// apps/web/server/jupiterClients.ts
//
// Server-side RPC factory for the Jupiter plugin. Mainnet only.
//
// Env:
//   SOLANA_RPC_URL_SERVER — preferred RPC endpoint (e.g. Helius/QuickNode).
//   Defaults to public mainnet (best-effort, rate-limited).

import { SOLANA_MAINNET } from "@wishd/plugin-sdk";
import { createSolanaRpc } from "@solana/kit";

export function solanaRpcFor(caip2: string): ReturnType<typeof createSolanaRpc> {
  if (caip2 !== SOLANA_MAINNET) {
    throw new Error(`jupiter is mainnet-only (got ${caip2})`);
  }
  const url = process.env.SOLANA_RPC_URL_SERVER ?? "https://api.mainnet-beta.solana.com";
  return createSolanaRpc(url);
}
