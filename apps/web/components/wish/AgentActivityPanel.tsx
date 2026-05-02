"use client";

import type { AgentEvent } from "@/store/workspace";
import { useWorkspace } from "@/store/workspace";

export function AgentActivityPanel() {
  const events = useWorkspace((s) => s.agentActivity);
  return (
    <aside className="agent-activity hidden md:block sticky top-10 h-[calc(100vh-3rem)] w-[280px] overflow-y-auto rounded-lg border border-rule bg-bg-2 p-3 text-xs font-mono">
      <div className="mb-2 flex items-center justify-between text-ink-2">
        <span className="uppercase tracking-wider">agent</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <div className="text-ink-2">agent idle — type a wish</div>
      ) : (
        <ul className="space-y-1">
          {events.map((e, i) => (
            <li key={i} className={lineClass(e)}>
              <span className="text-ink-2">{formatTime(e.at)} · </span>
              {renderEvent(e)}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function renderEvent(e: AgentEvent) {
  switch (e.kind) {
    case "tool.call":
      return (
        <>
          <span className="text-ink-2">tool </span>
          <span className="text-accent">{e.name}</span>
          {summarizeInput(e.input)}
        </>
      );
    case "delta":
      return <span>{e.text}</span>;
    case "ui.render":
      return (
        <>
          <span className="text-ink-2">render </span>
          <span className="text-accent">{e.widgetType}</span>
        </>
      );
    case "ui.patch":
      return <><span className="text-ink-2">patch </span>{e.widgetId.slice(0, 8)}</>;
    case "ui.dismiss":
      return <><span className="text-ink-2">dismiss </span>{e.widgetId.slice(0, 8)}</>;
    case "notification":
      return <span>notify [{e.level}]: {e.text}</span>;
    case "result":
      return (
        <span>agent done {e.ok ? "✓" : "✗"}{e.cost ? ` · $${e.cost.toFixed(4)}` : ""}</span>
      );
    case "error":
      return <span>error: {e.message}</span>;
    case "step":
      return (
        <>
          <span className="text-ink-2">{e.status === "start" ? "→" : e.status === "ok" ? "✓" : "✗"} </span>
          <span className="text-accent">{e.label}</span>
          {e.ms != null ? <span className="text-ink-2"> · {e.ms}ms</span> : null}
        </>
      );
  }
}

function lineClass(e: AgentEvent): string {
  const base = "rounded-md border px-2 py-1";
  if (e.kind === "error") return `${base} border-red-500/40 bg-red-500/10`;
  if (e.kind === "notification" && e.level === "warn") return `${base} border-yellow-500/40 bg-yellow-500/10`;
  return `${base} border-rule`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function summarizeInput(input: unknown): string {
  try {
    const s = JSON.stringify(input);
    if (!s || s === "{}") return "";
    return ` ${s.length > 60 ? s.slice(0, 57) + "…" : s}`;
  } catch {
    return "";
  }
}
