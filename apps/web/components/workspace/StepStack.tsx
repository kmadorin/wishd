"use client";

import { useWorkspace } from "@/store/workspace";
import { getWidget } from "@/widgetRegistry";
import { StepCard } from "@/components/primitives/StepCard";

const STEP_LABELS: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
  "compound-withdraw-summary": {
    step: "STEP 02",
    title: "your withdraw, materialized",
    sub: "review and execute",
  },
};

export function StepStack() {
  const widgets = useWorkspace((s) => s.widgets);
  const flow = widgets.filter((w) => w.slot === "flow");
  return (
    <>
      {flow.map((w) => {
        const W = getWidget(w.type);
        if (!W) return null;
        const label = STEP_LABELS[w.type] ?? { step: "STEP", title: w.type };
        return (
          <StepCard key={w.id} step={label.step} title={label.title} sub={label.sub}>
            <W {...w.props} />
          </StepCard>
        );
      })}
    </>
  );
}
