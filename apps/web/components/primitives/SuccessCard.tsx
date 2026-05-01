"use client";
import type { ReactNode } from "react";

export type SuccessSummaryRow = { k: string; v: ReactNode };

export type KeeperOffer = {
  id: string;
  badge?: string;
  title: string;
  desc: string;
  featured?: boolean;
  comingSoon?: boolean;
};

export type SuccessCardProps = {
  title: string;
  sub?: string;
  summary: SuccessSummaryRow[];
  keeperOffers?: KeeperOffer[];
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};

export function SuccessCard({
  title, sub, summary, keeperOffers = [], primaryAction, secondaryAction,
}: SuccessCardProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-5 items-start">
      <div>
        <h3 className="font-hand text-[26px] font-bold leading-tight">{title}</h3>
        {sub && <p className="text-xs text-ink-3 mt-1 mb-3.5">{sub}</p>}

        {keeperOffers.length > 0 && (
          <>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 mb-3">workflows you can deploy</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              {keeperOffers.map((o) => (
                <div key={o.id} className={[
                  "bg-surface-2 border-[1.5px] rounded-sm p-3.5",
                  o.featured ? "border-ink" : "border-rule",
                ].join(" ")}>
                  {o.badge && (
                    <span className="inline-block font-mono text-[9px] border border-rule rounded px-1.5 py-px text-ink-3 mb-1.5">
                      {o.badge}
                    </span>
                  )}
                  <div className="font-bold text-sm mb-1">{o.title}</div>
                  <p className="text-xs text-ink-3 mb-2.5 leading-snug">{o.desc}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={o.comingSoon}
                      title={o.comingSoon ? "coming soon" : undefined}
                      className="bg-accent border-[1.5px] border-ink rounded-pill px-3 py-1 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >deploy ✦</button>
                    <button
                      type="button"
                      disabled={o.comingSoon}
                      title={o.comingSoon ? "coming soon" : undefined}
                      className="bg-transparent border-[1.5px] border-rule rounded-pill px-3 py-1 text-xs text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >customize</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

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
