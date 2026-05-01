import type { ReactNode } from "react";

export type StepPhase = "in-progress" | "locked" | "complete";

export type StepCardProps = {
  step: string;
  title: string;
  status?: string;
  onEdit?: () => void;
  sub?: string;
  phase?: StepPhase;
  children?: ReactNode;
};

export function StepCard({
  step, title, status, onEdit, sub, phase = "in-progress", children,
}: StepCardProps) {
  const locked = phase === "locked";
  return (
    <section
      className={[
        "relative animate-fadeUp",
        "bg-surface border-2 border-ink rounded-2xl shadow-card",
        "px-6 pt-5 pb-[22px]",
        locked ? "opacity-[0.92]" : "",
      ].join(" ")}
    >
      <header className="flex items-baseline gap-3 mb-1">
        <span className="font-mono text-[10.5px] tracking-[0.1em] font-medium bg-bg-2 text-ink border-[1.5px] border-ink rounded-[5px] px-[7px] py-[3px] flex-shrink-0">
          {step}
        </span>
        <h2 className="font-hand text-[32px] font-bold leading-[1.1] flex-1 text-ink">{title}</h2>
        {locked && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-ink-2 border-[1.5px] border-ink rounded-pill px-3 py-1 bg-bg hover:bg-accent-2"
          >
            edit ✎
          </button>
        ) : status ? (
          <span className="text-xs text-ink-3 italic flex-shrink-0">{status}</span>
        ) : null}
      </header>
      {sub && <p className="text-[13.5px] text-ink-2 mt-1 mb-[14px]">{sub}</p>}
      <div className={["step-body", locked ? "pointer-events-none" : ""].join(" ")}>
        {children}
      </div>
    </section>
  );
}
