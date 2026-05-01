"use client";

import { useState } from "react";

export type CompoundSummaryProps = {
  amount: string;
  asset: string;
  market: string;
  needsApprove: boolean;
  summaryId: string;
  amountWei: string;
  chainId: number;
  user: `0x${string}`;
  comet: `0x${string}`;
  usdc: `0x${string}`;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: `0x${string}` }>;
};

export function CompoundSummary(props: CompoundSummaryProps) {
  const [submitting, setSubmitting] = useState(false);

  function execute() {
    setSubmitting(true);
    window.dispatchEvent(
      new CustomEvent("wishd:wish", {
        detail: {
          wish: `execute deposit ${props.summaryId}`,
          account: { address: props.user, chainId: props.chainId },
          context: {
            summaryId: props.summaryId,
            prepared: {
              amount: props.amount,
              asset: props.asset,
              market: props.market,
              needsApprove: props.needsApprove,
              amountWei: props.amountWei,
              chainId: props.chainId,
              user: props.user,
              comet: props.comet,
              usdc: props.usdc,
              calls: props.calls,
            },
          },
        },
      }),
    );
    // Re-enable after a tick — the StreamBus runs the request; the new
    // compound-execute widget rendering is the user's "next state."
    setTimeout(() => setSubmitting(false), 1000);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Kv label="amount" value={`${props.amount} ${props.asset}`} />
        <Kv label="market" value={props.market} />
        <Kv label="action" value={props.needsApprove ? "approve + supply" : "supply"} />
      </div>
      <button
        type="button"
        onClick={execute}
        disabled={submitting}
        className="mt-5 w-full rounded-pill bg-accent text-ink py-3 font-semibold hover:bg-accent-2 disabled:opacity-50"
      >
        {submitting ? "preparing…" : "execute"}
      </button>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-surface-2 border border-rule px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="font-mono text-ink">{value}</div>
    </div>
  );
}
