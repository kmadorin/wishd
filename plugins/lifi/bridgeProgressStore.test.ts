/**
 * bridgeProgressStore.test.ts — TDD for zustand persist store
 *
 * Injects a mock localStorage storage to verify persistence + rehydration.
 * vi.resetModules() is used to test fresh-mount rehydration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBridgeProgressStore, useBridgeProgressStore } from "./store/bridgeProgressStore";
import type { BridgeRecord } from "./store/bridgeProgressStore";
import type { LifiStatusObservation } from "./types";

// ---------------------------------------------------------------------------
// In-memory mock storage shared per-test
// ---------------------------------------------------------------------------
function makeMockStorage() {
  const _data: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => _data[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { _data[key] = value; }),
    removeItem: vi.fn((key: string) => { delete _data[key]; }),
    _data,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_CONFIG = {
  fromCaip2: "eip155:1",
  toCaip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  fromAddress: "0xUSER",
  toAddress: "SolanaAddr",
  assetInCaip19: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  assetOutCaip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
  amountAtomic: "10000000",
  slippage: 0.005,
};

const MOCK_OBS: LifiStatusObservation = {
  family: "lifi-status",
  endpoint: "https://li.quest/v1/status",
  query: {
    txHash: "0xabc",
    fromChain: 1,
    toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  },
  successWhen: { path: "status", equals: "DONE" },
  failureWhen: { path: "status", equalsAny: ["FAILED", "INVALID"] },
  display: { title: "Bridging", fromLabel: "Ethereum", toLabel: "Solana" },
};

const RECORD_ID = "0xabc";

function makeRecord(overrides?: Partial<BridgeRecord>): BridgeRecord {
  return {
    id: RECORD_ID,
    config: MOCK_CONFIG,
    observation: MOCK_OBS,
    startedAt: 1000,
    lastStatus: "PENDING",
    ...overrides,
  };
}

describe("createBridgeProgressStore (injected storage)", () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;
  let store: ReturnType<typeof createBridgeProgressStore>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    store = createBridgeProgressStore(mockStorage);
  });

  it("records initially empty", () => {
    const { records } = store.getState();
    expect(records).toEqual({});
  });

  it("upsert adds the record keyed by id", () => {
    store.getState().upsert(makeRecord());
    const { records } = store.getState();
    expect(records[RECORD_ID]).toBeDefined();
    expect(records[RECORD_ID]!.lastStatus).toBe("PENDING");
    expect(records[RECORD_ID]!.config).toMatchObject({ fromCaip2: "eip155:1" });
  });

  it("patch updates only the patched fields, preserves others", () => {
    store.getState().upsert(makeRecord());
    store.getState().patch(RECORD_ID, {
      lastStatus: "DONE",
      destTxHash: "0xdestination",
      toAmountActual: "9.9",
    });

    const rec = store.getState().records[RECORD_ID]!;
    expect(rec.lastStatus).toBe("DONE");
    expect(rec.destTxHash).toBe("0xdestination");
    expect(rec.toAmountActual).toBe("9.9");
    // Preserved fields
    expect(rec.startedAt).toBe(1000);
    expect(rec.config).toMatchObject({ fromCaip2: "eip155:1" });
  });

  it("after upsert + patch, storage.setItem was called with JSON containing updated lastStatus", async () => {
    store.getState().upsert(makeRecord());
    store.getState().patch(RECORD_ID, { lastStatus: "DONE" });

    // zustand persist writes asynchronously — wait a tick
    await new Promise((r) => setTimeout(r, 0));

    expect(mockStorage.setItem).toHaveBeenCalledWith("wishd:lifi:bridges", expect.any(String));
    const callArg = mockStorage.setItem.mock.calls.at(-1)![1]!;
    const parsed = JSON.parse(callArg);
    expect(parsed.state.records[RECORD_ID].lastStatus).toBe("DONE");
  });

  it("rehydration: pre-seed storage with v1 blob → fresh store created with that storage has the record", async () => {
    // Seed storage with a v1 blob
    const blob = JSON.stringify({
      state: {
        records: {
          [RECORD_ID]: {
            id: RECORD_ID,
            config: MOCK_CONFIG,
            observation: MOCK_OBS,
            startedAt: 1000,
            lastStatus: "DONE",
            destTxHash: "0xdest",
          },
        },
      },
      version: 1,
    });
    mockStorage._data["wishd:lifi:bridges"] = blob;

    // Create a fresh store using the same pre-seeded storage (simulates page reload)
    const freshStore = createBridgeProgressStore(mockStorage);

    // Allow hydration to complete
    await new Promise((r) => setTimeout(r, 0));

    const { records } = freshStore.getState();
    expect(records[RECORD_ID]).toBeDefined();
    expect(records[RECORD_ID]!.lastStatus).toBe("DONE");
  });

  it("patch for unknown id is a no-op (no record created)", () => {
    store.getState().patch("0xunknown", { lastStatus: "DONE" });
    const { records } = store.getState();
    expect(records["0xunknown"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Also verify the default singleton export is defined
// ---------------------------------------------------------------------------
describe("useBridgeProgressStore (default singleton)", () => {
  it("is a callable zustand store", () => {
    expect(typeof useBridgeProgressStore).toBe("function");
    expect(useBridgeProgressStore.getState).toBeDefined();
    const state = useBridgeProgressStore.getState();
    expect(state.records).toBeDefined();
    expect(typeof state.upsert).toBe("function");
    expect(typeof state.patch).toBe("function");
  });
});
