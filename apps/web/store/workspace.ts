import { create } from "zustand";
import type { WidgetSlot } from "@wishd/plugin-sdk";

export type WidgetInstance = {
  id: string;
  type: string;
  slot: WidgetSlot;
  props: Record<string, unknown>;
  createdAt: number;
};

export type SkeletonInit = {
  id: string;
  widgetType: string;
  amount?: string;
  asset?: string;
};

type State = {
  widgets: WidgetInstance[];
  narration: string;
  appendWidget: (w: Omit<WidgetInstance, "createdAt">) => void;
  patchWidget: (id: string, props: Record<string, unknown>) => void;
  dismissWidget: (id: string) => void;
  appendSkeleton: (s: SkeletonInit) => void;
  hydrateSkeleton: (id: string, replacement: Omit<WidgetInstance, "createdAt">) => void;
  failSkeleton: (id: string, message: string) => void;
  appendNarration: (delta: string) => void;
  reset: () => void;
};

const STEP_FOR_WIDGET: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-withdraw-summary": { step: "STEP 02", title: "your withdraw, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
};

export const SKELETON_TYPE = "__skeleton__";

export const useWorkspace = create<State>((set) => ({
  widgets: [],
  narration: "",
  appendWidget: (w) =>
    set((s) => ({
      widgets: [...s.widgets, { ...w, createdAt: Date.now() }],
    })),
  patchWidget: (id, props) =>
    set((s) => ({
      widgets: s.widgets.map((x) => (x.id === id ? { ...x, props: { ...x.props, ...props } } : x)),
    })),
  dismissWidget: (id) =>
    set((s) => ({ widgets: s.widgets.filter((x) => x.id !== id) })),
  appendSkeleton: ({ id, widgetType, amount, asset }) =>
    set((s) => {
      const label = STEP_FOR_WIDGET[widgetType] ?? { step: "STEP 02", title: "preparing…" };
      return {
        widgets: [
          ...s.widgets,
          {
            id,
            type: SKELETON_TYPE,
            slot: "flow",
            props: {
              widgetType,
              state: "pending",
              amount,
              asset,
              step: label.step,
              title: label.title,
              sub: label.sub,
            },
            createdAt: Date.now(),
          },
        ],
      };
    }),
  hydrateSkeleton: (id, replacement) =>
    set((s) => {
      const idx = s.widgets.findIndex((w) => w.id === id);
      if (idx === -1) return s;
      const next = s.widgets.slice();
      next[idx] = { ...replacement, createdAt: Date.now() };
      return { widgets: next };
    }),
  failSkeleton: (id, message) =>
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.id === id && w.type === SKELETON_TYPE
          ? { ...w, props: { ...w.props, state: "error", errorMessage: message } }
          : w,
      ),
    })),
  appendNarration: (delta) => set((s) => ({ narration: s.narration + delta })),
  reset: () => set({ widgets: [], narration: "" }),
}));
