"use client";
import type { ReactNode } from "react";

export type BalanceChange = { sign: "+" | "-"; token: string; amount: string };
export type SafetyItem = { ok: boolean; text: string };

export type AICheckPanelProps = {
  status?: "live" | "stale";
  title?: string;             // default "AI safety check"
  sub?: string;               // default "balance + allowance + sim"
  balanceChanges?: BalanceChange[];
  safety?: SafetyItem[];
  allowance?: ReactNode;      // optional CTA block
};

export function AICheckPanel({
  status = "live",
  title = "AI safety check",
  sub = "balance · allowance · simulation",
  balanceChanges = [],
  safety = [],
  allowance,
}: AICheckPanelProps) {
  return (
    <aside className="border-[1.5px] border-dashed border-ink rounded-2xl bg-bg p-4">
      <header className="flex items-baseline gap-2 mb-0.5">
        <h3 className="text-[15px] font-semibold flex-1">{title}</h3>
        <span className="text-xs italic text-accent flex items-center gap-1">
          <span className="live-dot" /> {status === "live" ? "live" : "stale"}
        </span>
      </header>
      <p className="text-xs text-ink-3 mb-3.5">{sub}</p>

      {balanceChanges.length > 0 && (
        <>
          <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-3 mb-2">balance changes</div>
          {balanceChanges.map((b, i) => (
            <div
              key={`${b.token}-${i}`}
              className={[
                "flex items-center gap-2 px-2.5 py-[7px] border-[1.5px] border-dashed rounded-sm mb-1.5 text-[13px]",
                b.sign === "+" ? "bg-mint-2 border-mint" : "bg-[#FDEAEA] border-bad",
              ].join(" ")}
            >
              <span className="font-mono font-bold">{b.sign}</span>
              <span className="flex-1 font-medium">{b.token}</span>
              <span className="font-mono font-medium text-xs">{b.amount}</span>
            </div>
          ))}
          <div className="h-px bg-rule my-3" />
        </>
      )}

      {safety.length > 0 && (
        <>
          <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-3 mb-2">checks</div>
          {safety.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[13px] mb-[7px] leading-snug">
              <span className={[
                "w-[18px] h-[18px] rounded flex-shrink-0 flex items-center justify-center text-[11px] font-bold",
                s.ok ? "bg-good" : "bg-bad",
                "text-ink",
              ].join(" ")}>{s.ok ? "✓" : "!"}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </>
      )}

      {allowance && <div className="mt-2.5 flex flex-col gap-1.5">{allowance}</div>}
    </aside>
  );
}
