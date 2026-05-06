import type { SolanaRpcLike } from "../ctx";

export async function getPriorityFeeEstimate(
  rpc: Pick<SolanaRpcLike, "getRecentPrioritizationFees">,
  accounts: string[],
): Promise<number> {
  const fees = await rpc.getRecentPrioritizationFees(accounts).send();
  if (fees.length === 0) return 0;
  const sorted = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  return sorted[idx]!;
}
