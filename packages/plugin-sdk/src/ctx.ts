import type { PublicClient } from "viem";
import type { ServerEvent } from "./index";

// Solana RPC kept structural — peer-dep typing only.
export type SolanaRpcLike = {
  getBalance: (address: string) => { send: () => Promise<{ value: bigint }> };
  getBlockHeight: () => { send: () => Promise<bigint> };
  getSignatureStatuses: (sigs: string[]) => { send: () => Promise<unknown> };
  getRecentPrioritizationFees: (accounts?: string[]) => { send: () => Promise<Array<{ slot: bigint; prioritizationFee: number }>> };
  sendTransaction: (tx: string | Uint8Array) => { send: () => Promise<string> };
  getTokenAccountBalance: (address: string) => { send: () => Promise<{ value: { amount: string; decimals: number } }> };
};

export type Emit = (e: ServerEvent) => void;

export type EvmCtx = { family: "evm"; publicClient: PublicClient; emit: Emit };
export type SvmCtx = { family: "svm"; rpc: SolanaRpcLike; emit: Emit; caip2: string };

export type PluginCtx = EvmCtx | SvmCtx;

export function isEvmCtx(c: PluginCtx): c is EvmCtx { return c.family === "evm"; }
export function isSvmCtx(c: PluginCtx): c is SvmCtx { return c.family === "svm"; }
