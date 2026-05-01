import type { ReactNode } from "react";

export type StepPhase = "locked" | "in-progress" | "complete";

export type StepCardProps = {
  step: string;
  title: string;
  status?: string;
  sub?: string;
  phase?: StepPhase;
  children?: ReactNode;
};

export function StepCard({ step, title, status, sub, phase = "in-progress", children }: StepCardProps) {
  const lockedCls = phase === "locked" ? "opacity-50 pointer-events-none" : "";
  return (
    <section
      className={`mt-5 rounded-lg bg-surface border border-rule shadow-[0_2px_8px_var(--shadow)] p-6 ${lockedCls}`}
    >
      <header className="flex items-baseline gap-3">
        <span className="text-[11px] tracking-[0.18em] font-mono uppercase text-ink-3">{step}</span>
        <h2 className="text-xl font-semibold text-ink flex-1">{title}</h2>
        {status && (
          <span className="text-xs px-2 py-0.5 rounded-pill bg-warn-2 text-ink-2">{status}</span>
        )}
      </header>
      {sub && <p className="text-[13.5px] text-ink-2 mt-1 mb-3">{sub}</p>}
      <div>{children}</div>
    </section>
  );
}
