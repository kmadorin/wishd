"use client";
import type { ReactNode } from "react";

export type ExecPhase = "queued" | "active" | "done" | "error";

export type ExecStep = {
  id: string;
  title: string;
  sub?: string;
  phase: ExecPhase;
  detail?: ReactNode;
};

export type ExecuteTimelineProps = {
  steps: ExecStep[];
  cta?: { label: string; onClick: () => void; disabled?: boolean };
  back?: { onClick: () => void; label?: string };
};

const PHASE_ICON: Record<ExecPhase, ReactNode> = {
  queued: "•",
  active: <span className="inline-block animate-spin">◐</span>,
  done: "✓",
  error: "×",
};

const PHASE_STATUS: Record<ExecPhase, string> = {
  queued: "queued",
  active: "in progress",
  done: "done",
  error: "failed",
};

export function ExecuteTimeline({ steps, cta, back }: ExecuteTimelineProps) {
  return (
    <div>
      <div className="flex flex-col">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const dim = s.phase === "queued";
          return (
            <div
              key={s.id}
              className={[
                "grid grid-cols-[32px_1fr_auto] gap-3.5 items-center py-3",
                last ? "" : "border-b-[1.5px] border-rule",
                dim ? "opacity-40" : "opacity-100",
                "transition-opacity",
              ].join(" ")}
            >
              <span
                className={[
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center text-[13px] font-mono",
                  s.phase === "done" ? "bg-good border-ink" :
                  s.phase === "active" ? "bg-accent-2 border-accent animate-pulse" :
                  s.phase === "error" ? "bg-bad border-ink" :
                  "border-rule bg-surface-2",
                ].join(" ")}
              >{PHASE_ICON[s.phase]}</span>
              <div>
                <div className="font-hand text-[17px] font-bold">{s.title}</div>
                {s.sub && <div className="text-xs text-ink-3">{s.sub}</div>}
                {s.detail && <div className="mt-1">{s.detail}</div>}
              </div>
              <span
                className={[
                  "font-mono text-[11px]",
                  s.phase === "active" ? "text-accent italic" :
                  s.phase === "done" ? "text-ink-2" :
                  s.phase === "error" ? "text-bad" :
                  "text-ink-3",
                ].join(" ")}
              >{PHASE_STATUS[s.phase]}</span>
            </div>
          );
        })}
      </div>
      {(cta || back) && (
        <div className="flex justify-end gap-2 mt-4">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              className="rounded-pill border-[1.5px] border-rule px-3.5 py-1.5 text-[13px] text-ink-2 hover:border-ink hover:text-ink"
            >{back.label ?? "back"}</button>
          )}
          {cta && (
            <button
              type="button"
              onClick={cta.onClick}
              disabled={cta.disabled}
              className="rounded-pill bg-accent border-2 border-ink text-ink px-[22px] py-2.5 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none"
            >{cta.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
