/**
 * bridgeProgressStore.ts — zustand persist store for in-flight bridge records.
 *
 * Keys records by source txHash (`id`).
 * Persists to localStorage under "wishd:lifi:bridges" (version 1).
 * BridgeProgress widget rehydrates on mount and resumes polling if lastStatus === "PENDING".
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LifiBridgeConfig, LifiStatusObservation, LifiBridgeStatus } from "../types";

export type BridgeRecord = {
  /** Source transaction hash — primary key. */
  id: string;
  config: LifiBridgeConfig;
  /** LifiStatusObservation with txHash already substituted (not a Placeholder). */
  observation: LifiStatusObservation;
  startedAt: number;
  lastStatus: LifiBridgeStatus;
  destTxHash?: string;
  toAmountActual?: string;
  lastError?: string;
};

type State = {
  records: Record<string, BridgeRecord>;
  upsert: (r: BridgeRecord) => void;
  patch: (id: string, p: Partial<BridgeRecord>) => void;
};

/** Minimal storage interface compatible with zustand persist + localStorage. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Factory for the zustand store. Accepts an optional custom storage for testing.
 * The default export `useBridgeProgressStore` uses localStorage (or a noop in SSR/node).
 */
export function createBridgeProgressStore(storage?: StorageLike) {
  const resolvedStorage: StorageLike = storage ?? (
    typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  );

  return create<State>()(
    persist(
      (set) => ({
        records: {},
        upsert: (r) =>
          set((s) => ({ records: { ...s.records, [r.id]: r } })),
        patch: (id, p) =>
          set((s) =>
            s.records[id]
              ? { records: { ...s.records, [id]: { ...s.records[id]!, ...p } } }
              : s,
          ),
      }),
      {
        name: "wishd:lifi:bridges",
        version: 1,
        storage: createJSONStorage(() => resolvedStorage),
      },
    ),
  );
}

/**
 * Default singleton store — uses localStorage in browsers, noop in SSR/node.
 */
export const useBridgeProgressStore = createBridgeProgressStore();

/**
 * Stable API surface consumed by LifiStatusPoller (avoids circular import of
 * the full zustand store on the server side).
 */
export type BridgeProgressStoreApi = {
  upsert: (r: BridgeRecord) => void;
  patch: (id: string, p: Partial<BridgeRecord>) => void;
};
