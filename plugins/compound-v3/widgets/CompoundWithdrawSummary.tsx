"use client";

import { useState } from "react";

export type CompoundWithdrawSummaryProps = {
  amount: string;
  asset: string;
  market: string;
  summaryId: string;
  amountWei: string;
  chainId: number;
  user: `0x${string}`;
  comet: `0x${string}`;
  usdc: `0x${string}`;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: `0x${string}` }>;
  supplied?: string;
  insufficient?: boolean;
};

export function CompoundWithdrawSummary(props: CompoundWithdrawSummaryProps) {
  const [submitting, setSubmitting] = useState(false);
  const blocked = props.insufficient === true;

  function execute() {
    if (blocked) return;
    setSubmitting(true);
    window.dispatchEvent(
      new CustomEvent("wishd:wish", {
        detail: {
          wish: `execute withdraw ${props.summaryId}`,
          account: { address: props.user, chainId: props.chainId },
          context: {
            summaryId: props.summaryId,
            preparedKind: "withdraw",
            prepared: {
              amount: props.amount,
              asset: props.asset,
              market: props.market,
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
    setTimeout(() => setSubmitting(false), 1000);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Kv label="amount" value={`${props.amount} ${props.asset}`} />
        <Kv label="market" value={props.market} />
        <Kv label="action" value="withdraw" />
        {props.supplied !== undefined && (
          <Kv
            label="your supply"
            value={`${props.supplied} ${props.asset}`}
            tone={blocked ? "bad" : "default"}
          />
        )}
      </div>

      {blocked && (
        <div className="mt-4 rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
          insufficient supplied {props.asset}. you have {props.supplied} supplied but want to withdraw {props.amount}.
          reduce the amount or deposit more first.
        </div>
      )}

      <button
        type="button"
        onClick={execute}
        disabled={submitting || blocked}
        className="mt-5 w-full rounded-pill bg-accent text-ink py-3 font-semibold hover:bg-accent-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {blocked ? "insufficient supply" : submitting ? "preparing…" : "execute"}
      </button>
    </div>
  );
}

function Kv({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad";
}) {
  const valueCls = tone === "bad" ? "font-mono text-bad" : "font-mono text-ink";
  return (
    <div className="rounded-sm bg-surface-2 border border-rule px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={valueCls}>{value}</div>
    </div>
  );
}
