import type { Address, Keeper, ExpiryPolicy, SpendPeriod } from "@wishd/plugin-sdk";

export type DelegationProposal = {
  expiry: ExpiryPolicy;
  spend: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  rationale?: string;
};

export type AgentSuggestion = {
  expiry?: ExpiryPolicy;
  spend?: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  rationale?: string;
} | null;

export function proposeDelegation(args: {
  keeper: Keeper;
  agentSuggestion: AgentSuggestion;
}): DelegationProposal {
  const { keeper, agentSuggestion } = args;
  if (keeper.delegation.kind !== "porto-permissions") {
    throw new Error("proposeDelegation only supports porto-permissions delegations");
  }
  const { expiryPolicy, spend } = keeper.delegation;

  // Expiry — keeper-author policy wins for "fixed" + "unlimited"; only "bounded" is user/agent adjustable.
  let expiry: ExpiryPolicy = expiryPolicy;
  if (expiryPolicy.kind === "bounded") {
    const sug = agentSuggestion?.expiry;
    if (sug?.kind === "bounded") {
      const days = Math.max(1, Math.min(expiryPolicy.maxDays, sug.maxDays));
      expiry = { kind: "bounded", maxDays: days };
    }
  }

  // Spend — start from defaults, layer in agent suggestions clamped to bounds.
  const out = new Map<Address, { token: Address; limit: bigint; period: SpendPeriod }>();
  for (const d of spend.defaults) out.set(d.token, { ...d });

  if (agentSuggestion?.spend) {
    for (const sug of agentSuggestion.spend) {
      const bound = spend.bounds.find((b) => b.token === sug.token);
      if (!bound) continue; // not in allowlist
      const period: SpendPeriod = bound.periods.includes(sug.period)
        ? sug.period
        : (out.get(sug.token)?.period ?? bound.periods[0]);
      const limit = sug.limit > bound.maxLimit ? bound.maxLimit : sug.limit < 0n ? 0n : sug.limit;
      out.set(sug.token, { token: sug.token, limit, period });
    }
  }

  return {
    expiry,
    spend: [...out.values()],
    rationale: agentSuggestion?.rationale,
  };
}
