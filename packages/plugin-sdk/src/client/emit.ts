"use client";

import { create } from "zustand";
import type { ServerEvent } from "../index";

type State = {
  events: ServerEvent[];
  emit: (e: ServerEvent) => void;
  clear: () => void;
};

export const useEmitStore = create<State>((set) => ({
  events: [],
  emit:  (e) => set((s) => ({ events: [...s.events, e] })),
  clear: () => set({ events: [] }),
}));

export function useEmit(): (e: ServerEvent) => void {
  return useEmitStore((s) => s.emit);
}

/** @internal */
export const _emitBusForTest = {
  reset: () => useEmitStore.setState({ events: [] }),
};
