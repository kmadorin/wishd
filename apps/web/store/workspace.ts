import { create } from "zustand";
import type { WidgetSlot } from "@wishd/plugin-sdk";

export type WidgetInstance = {
  id: string;
  type: string;
  slot: WidgetSlot;
  props: Record<string, unknown>;
  createdAt: number;
};

type State = {
  widgets: WidgetInstance[];
  narration: string;
  appendWidget: (w: Omit<WidgetInstance, "createdAt">) => void;
  patchWidget: (id: string, props: Record<string, unknown>) => void;
  dismissWidget: (id: string) => void;
  appendNarration: (delta: string) => void;
  reset: () => void;
};

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
  appendNarration: (delta) => set((s) => ({ narration: s.narration + delta })),
  reset: () => set({ widgets: [], narration: "" }),
}));
