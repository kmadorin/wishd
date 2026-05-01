"use client";

import { useState } from "react";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import { AICheckPanel } from "../../../apps/web/components/primitives/AICheckPanel";
import { TokenDot } from "../../../apps/web/lib/tokenIcons";
import { useWorkspace } from "../../../apps/web/store/workspace";

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
  const executing = useWorkspace((s) => s.executing);
  const blocked = props.insufficient === true;

  function execute() {
    if (blocked) return;
    setSubmitting(true);
    window.dispatchEvent(new CustomEvent("wishd:wish", {
      detail: {
        wish: `execute withdraw ${props.summaryId}`,
        account: { address: props.user, chainId: props.chainId },
        context: {
          summaryId: props.summaryId,
          preparedKind: "withdraw",
          prepared: { ...props },
        },
      },
    }));
    setTimeout(() => setSubmitting(false), 1000);
  }

  return (
    <div className="flex flex-col gap-3">
      <WidgetCard>
        <WidgetCard.Head name="withdraw" badge="COMPOUND V3 · 1 TX" />
        <WidgetCard.AmountSection
          label="you withdraw"
          amount={props.amount}
          asset={<><TokenDot ticker={props.asset} />{props.asset}</>}
          sub={<>≈ <span className="font-mono">{props.amount}</span> USD</>}
          max={props.supplied !== undefined ? `supplied: ${props.supplied} ${props.asset}` : undefined}
        />
        <WidgetCard.Stats items={[
          { k: "market", v: props.market },
          { k: "action", v: "withdraw" },
        ]} />
        {blocked && (
          <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
            insufficient supplied {props.asset}. you have {props.supplied} supplied but want to withdraw {props.amount}.
            reduce the amount or deposit more first.
          </div>
        )}
        <WidgetCard.Cta>
          <button
            type="button"
            onClick={execute}
            disabled={submitting || blocked || executing}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent border-2 border-ink text-ink py-3 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {blocked ? "insufficient supply" : submitting ? "preparing…" : "withdraw →"}
          </button>
        </WidgetCard.Cta>
      </WidgetCard>
      <AICheckPanel
        title="safety check"
        sub="reading wallet + simulation"
        safety={[
          { ok: true, text: `${props.asset} contract verified · ${props.usdc.slice(0, 10)}…` },
          { ok: true, text: `Compound Comet verified · ${props.comet.slice(0, 10)}…` },
          props.supplied !== undefined && !props.insufficient
            ? { ok: true, text: `supply covers amount (${props.supplied} ${props.asset})` }
            : !props.insufficient
              ? { ok: true, text: "supply check pending" }
              : { ok: false, text: `supplied ${props.supplied} < ${props.amount}` },
        ]}
      />
    </div>
  );
}
