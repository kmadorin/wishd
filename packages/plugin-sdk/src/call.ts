import type { Address, Hex } from "viem";

// Solana types kept structural — no @solana/kit runtime import. Plugin authors
// pass kit-shaped values through. Avoids new runtime dep.
export type SvmInstruction = {
  programAddress: string;
  accounts: ReadonlyArray<{ address: string; role: number }>;
  data?: Uint8Array | string;
};

export type BlockhashLifetime = {
  kind: "blockhash";
  blockhash: string;
  lastValidBlockHeight: bigint;
};
export type DurableNonceLifetime = {
  kind: "nonce";
  nonceAccountAddress: string;
  nonceAuthorityAddress: string;
  nonceValue: string;
};

export type EvmCall = {
  family: "evm";
  caip2: string;
  to: Address;
  data: Hex;
  value: bigint;
};

export type SvmTxCall = {
  family: "svm";
  caip2: string;
  kind: "tx";
  base64: string;
  lastValidBlockHeight: bigint;
  staleAfter?: number;
};

export type SvmInstructionsCall = {
  family: "svm";
  caip2: string;
  kind: "instructions";
  instructions: SvmInstruction[];
  feePayer: string;
  lifetime: BlockhashLifetime | DurableNonceLifetime;
};

export type SvmCall = SvmTxCall | SvmInstructionsCall;
export type Call    = EvmCall | SvmCall;

export function isEvmCall(c: Call): c is EvmCall { return c.family === "evm"; }
export function isSvmCall(c: Call): c is SvmCall { return c.family === "svm"; }
export function isSvmTxCall(c: Call): c is SvmTxCall {
  return c.family === "svm" && c.kind === "tx";
}
export function isSvmInstructionsCall(c: Call): c is SvmInstructionsCall {
  return c.family === "svm" && c.kind === "instructions";
}
