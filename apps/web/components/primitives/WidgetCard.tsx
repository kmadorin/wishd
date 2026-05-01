"use client";
import type { ReactNode } from "react";

export type StatItem = { k: string; v: ReactNode };

export function WidgetCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-2 border-2 border-ink rounded-xl shadow-cardSm overflow-hidden">
      {children}
    </div>
  );
}

WidgetCard.Head = function Head({ name, badge }: { name: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
      <div className="font-hand text-[20px] font-bold">{name}</div>
      {badge && (
        <div className="font-mono text-[10px] border border-rule rounded-sm px-[7px] py-[2px] text-ink-3">
          {badge}
        </div>
      )}
    </div>
  );
};

WidgetCard.PaySection = function PaySection({ children }: { children: ReactNode }) {
  return <div className="bg-accent-2 px-4 py-3.5">{children}</div>;
};
WidgetCard.ReceiveSection = function ReceiveSection({ children }: { children: ReactNode }) {
  return <div className="bg-mint-2 px-4 py-3.5">{children}</div>;
};
WidgetCard.SwapDir = function SwapDir({ onFlip }: { onFlip?: () => void }) {
  return (
    <div className="flex justify-center items-center p-2 bg-surface-2 border-y border-rule">
      <button
        type="button" onClick={onFlip}
        className="w-8 h-8 rounded-full border-[1.5px] border-ink bg-surface-2 flex items-center justify-center cursor-pointer text-base hover:bg-accent-2 hover:rotate-180 transition-transform"
      >↕</button>
    </div>
  );
};

WidgetCard.AmountSection = function AmountSection({
  label, amount, asset, sub, max,
}: {
  label: string;
  amount: ReactNode;     // big Caveat number
  asset?: ReactNode;     // pill on the right
  sub?: ReactNode;       // small mono row beneath
  max?: ReactNode;       // small mono row, right column
}) {
  return (
    <div className="px-4 py-3.5 border-b border-rule">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5 flex justify-between items-center">
        <span>{label}</span>
        {max && <span className="font-mono text-[11px] text-ink-3">{max}</span>}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="font-hand text-[38px] font-bold leading-none mb-1">{amount}</div>
          {sub && <div className="font-mono text-xs text-ink-3">{sub}</div>}
        </div>
        {asset && (
          <span className="inline-flex items-center gap-1.5 bg-surface-2 border-[1.5px] border-ink rounded-pill px-2.5 py-1 font-bold text-sm">
            {asset}
          </span>
        )}
      </div>
    </div>
  );
};

WidgetCard.Stats = function Stats({ items }: { items: StatItem[] }) {
  // 2-col grid; last row removes bottom border, even cells remove right border.
  return (
    <div className="grid grid-cols-2 border-t border-rule">
      {items.map((it, i) => {
        const lastTwo = i >= items.length - (items.length % 2 === 0 ? 2 : 1);
        const right = i % 2 === 1;
        return (
          <div
            key={`${it.k}-${i}`}
            className={[
              "px-3.5 py-2.5",
              right ? "" : "border-r border-rule",
              lastTwo ? "" : "border-b border-rule",
            ].join(" ")}
          >
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">{it.k}</div>
            <div className="font-hand text-[17px] font-bold">{it.v}</div>
          </div>
        );
      })}
    </div>
  );
};

WidgetCard.Cta = function Cta({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3.5 border-t border-rule">{children}</div>;
};
