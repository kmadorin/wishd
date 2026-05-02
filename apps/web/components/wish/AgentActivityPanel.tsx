"use client";

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
            <li key={i} className="rounded-md border border-rule px-2 py-1">
              {e.kind === "tool.call" ? (
                <>
                  <span className="text-ink-2">{formatTime(e.at)} · tool</span>{" "}
                  <span className="text-accent">{e.name}</span>
                  {summarizeInput(e.input)}
                </>
              ) : (
                <span className="text-ink-2">{formatTime(e.at)} · {e.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
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
