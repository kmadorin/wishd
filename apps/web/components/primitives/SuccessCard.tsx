"use client";
import type { ReactNode } from "react";

export type SuccessSummaryRow = { k: string; v: ReactNode };

export type SuccessCardProps = {
  title: string;
  sub?: string;
  summary: SuccessSummaryRow[];
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};

export function SuccessCard({
  title, sub, summary, primaryAction, secondaryAction,
}: SuccessCardProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-5 items-start">
      <div>
        <h3 className="font-hand text-[26px] font-bold leading-tight">{title}</h3>
        {sub && <p className="text-xs text-ink-3 mt-1 mb-3.5">{sub}</p>}

        {(primaryAction || secondaryAction) && (
          <div className="flex gap-2 flex-wrap">
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="rounded-pill bg-accent border-2 border-ink text-ink px-[22px] py-2.5 text-[15px] font-semibold shadow-cardSm hover:bg-[#d4885a]"
              >{primaryAction.label}</button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="rounded-pill border-[1.5px] border-rule px-3.5 py-1.5 text-[13px] text-ink-2 hover:border-ink hover:text-ink"
              >{secondaryAction.label}</button>
            )}
          </div>
        )}
      </div>

      <aside className="bg-surface-2 border-[1.5px] border-dashed border-rule rounded-md p-4">
        <div className="font-hand text-[22px] font-bold mb-0.5">summary</div>
        <p className="text-xs text-ink-3 mb-3.5">your wish, fulfilled</p>
        {summary.map((r, i) => (
          <div key={`${r.k}-${i}`} className={[
            "flex justify-between py-1.5 text-[13px]",
            i === summary.length - 1 ? "" : "border-b border-rule",
          ].join(" ")}>
            <span className="font-mono text-[10px] uppercase text-ink-3">{r.k}</span>
            <span className="font-mono text-xs font-semibold text-right">{r.v}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
