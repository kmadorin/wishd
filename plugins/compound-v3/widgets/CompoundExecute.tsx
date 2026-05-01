"use client";

import type { Address } from "viem";

export type CompoundExecuteProps = {
  asset: string;
  market: string;
  amount: string;
  amountWei: string;
  chainId: number;
  user: Address;
  comet: Address;
  usdc: Address;
  calls: Array<{ to: Address; data: `0x${string}`; value: `0x${string}` }>;
  needsApprove: boolean;
};

export function CompoundExecute(_props: CompoundExecuteProps) {
  return (
    <div className="text-sm text-ink-2">CompoundExecute placeholder — implemented in T16.</div>
  );
}
