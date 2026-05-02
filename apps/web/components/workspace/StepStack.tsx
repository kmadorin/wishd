"use client";

import { useWorkspace, SKELETON_TYPE } from "@/store/workspace";
import { getWidget } from "@/widgetRegistry";
import { StepCard } from "@/components/primitives/StepCard";
import { SkeletonStepCard } from "./SkeletonStepCard";

const STEP_LABELS: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
  "compound-withdraw-summary": {
    step: "STEP 02",
    title: "your withdraw, materialized",
    sub: "review and execute",
  },
  "keeperhub-auth": { step: "STEP 04", title: "automate next time?", sub: "connect KeeperHub to enable keepers" },
};

export function StepStack() {
  const widgets = useWorkspace((s) => s.widgets);
  const flow = widgets.filter((w) => w.slot === "flow");
  return (
    <>
      {flow.map((w) => {
        if (w.type === SKELETON_TYPE) {
          const p = w.props as {
            widgetType: string;
            state?: "pending" | "error";
            errorMessage?: string;
            amount?: string;
            asset?: string;
            step?: string;
            title?: string;
            sub?: string;
          };
          return (
            <SkeletonStepCard
              key={w.id}
              step={p.step ?? "STEP 02"}
              title={p.title ?? "preparing…"}
              sub={p.sub}
              amount={p.amount}
              asset={p.asset}
              state={p.state}
              errorMessage={p.errorMessage}
            />
          );
        }
        const W = getWidget(w.type);
        if (!W) return null;
        const label = STEP_LABELS[w.type] ?? { step: "STEP", title: w.type };
        return (
          <StepCard key={w.id} step={label.step} title={label.title} sub={label.sub}>
            <W {...w.props} id={w.id} />
          </StepCard>
        );
      })}
    </>
  );
}
