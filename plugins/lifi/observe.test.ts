/**
 * observe.test.ts — TDD for LifiStatusPoller + fetchLifiStatus
 *
 * Uses vi.useFakeTimers() to control time precisely.
 * Mocks lifiFetch via the _serverClients module.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";

// Mock _serverClients so we can control lifiFetch
vi.mock("./_serverClients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_serverClients")>();
  return {
    ...actual,
    defaultDeps: {
      lifiFetch: vi.fn(),
      evmPublicClientFor: vi.fn(),
    },
  };
});

import { LifiStatusPoller, fetchLifiStatus } from "./observe";
import { defaultDeps } from "./_serverClients";
import type { LifiStatusObservation } from "./types";
import type { Emit } from "@wishd/plugin-sdk";

// Typed reference to the mocked lifiFetch
const mockLifiFetch = defaultDeps.lifiFetch as MockedFunction<typeof defaultDeps.lifiFetch>;

const SRC_TX_HASH = "0xdeadbeef1234567890abcdef";
const DEST_TX_HASH = "0xdestination000111222333";

const BASE_OBS: LifiStatusObservation = {
  family: "lifi-status",
  endpoint: "https://li.quest/v1/status",
  query: {
    txHash: SRC_TX_HASH,
    fromChain: 1,
    toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  },
  successWhen: { path: "status", equals: "DONE" },
  failureWhen: { path: "status", equalsAny: ["FAILED", "INVALID"] },
  pollMs: { initial: 3000, factor: 1.5, maxBackoff: 15000 },
  timeoutMs: 15 * 60 * 1000,
  display: { title: "Bridging", fromLabel: "Ethereum", toLabel: "Solana" },
};

function makeStore() {
  const records: Record<string, { lastStatus: string; destTxHash?: string; toAmountActual?: string }> = {};
  return {
    upsert: vi.fn((r: any) => { records[r.id] = r; }),
    patch: vi.fn((id: string, p: any) => {
      if (records[id]) Object.assign(records[id], p);
      else records[id] = p;
    }),
    _records: records,
  };
}

describe("fetchLifiStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards to lifiFetch /status with correct search params", async () => {
    mockLifiFetch.mockResolvedValue({ status: "PENDING", substatus: "WAIT_DESTINATION" });

    const result = await fetchLifiStatus({
      txHash: "0xabc",
      fromChain: 1,
      toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });

    expect(mockLifiFetch).toHaveBeenCalledWith("/status", {
      search: { txHash: "0xabc", fromChain: 1, toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
    });
    expect(result).toEqual({ status: "PENDING", substatus: "WAIT_DESTINATION" });
  });
});

describe("LifiStatusPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Case 1: PENDING → PENDING → DONE ────────────────────────────────────────
  it("PENDING → PENDING → DONE: emits 2 notifications then terminal result.ok=true with tx artifacts", async () => {
    mockLifiFetch
      .mockResolvedValueOnce({ status: "PENDING", substatus: "WAIT_SRC_CONFIRMATIONS" })
      .mockResolvedValueOnce({ status: "PENDING", substatus: "WAIT_DESTINATION" })
      .mockResolvedValueOnce({
        status: "DONE",
        receiving: { txHash: DEST_TX_HASH, amount: "990000000" },
        sending: { txHash: SRC_TX_HASH },
      });

    const emittedEvents: any[] = [];
    const emit: Emit = (e) => emittedEvents.push(e);
    const store = makeStore();
    // Seed the record
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    const controller = poller.start(SRC_TX_HASH, SRC_TX_HASH);

    // Advance through 3 ticks: 3000ms, 4500ms, 6750ms
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(4500);
    await vi.advanceTimersByTimeAsync(6750);

    // Wait for promises
    await Promise.resolve();
    await Promise.resolve();

    const notifications = emittedEvents.filter((e) => e.type === "notification");
    const results = emittedEvents.filter((e) => e.type === "result");

    expect(notifications.length).toBe(2);
    expect(notifications[0]).toMatchObject({
      type: "notification",
      level: "info",
    });
    // widgetUpdate containing phase:"pending"
    expect(notifications[0].widgetUpdate ?? notifications[0]).toBeDefined();

    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].summary).toMatch(/\d/); // contains amount
    expect(results[0].artifacts).toHaveLength(2);
    expect(results[0].artifacts[0]).toMatchObject({ kind: "tx", caip2: "eip155:1" });
    expect(results[0].artifacts[1]).toMatchObject({ kind: "tx", caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", hash: DEST_TX_HASH });

    expect(store._records[SRC_TX_HASH].lastStatus).toBe("DONE");

    // After terminal, no more events even after more time
    const countBefore = emittedEvents.length;
    await vi.advanceTimersByTimeAsync(30000);
    await Promise.resolve();
    expect(emittedEvents.length).toBe(countBefore);

    controller.abort(); // cleanup
  });

  // ── Case 2: PENDING → FAILED ────────────────────────────────────────────────
  it("PENDING → FAILED: terminal result.ok=false with recovery link", async () => {
    mockLifiFetch
      .mockResolvedValueOnce({ status: "PENDING" })
      .mockResolvedValueOnce({ status: "FAILED", substatus: "BRIDGE_REVERTED" });

    const emittedEvents: any[] = [];
    const emit: Emit = (e) => emittedEvents.push(e);
    const store = makeStore();
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    poller.start(SRC_TX_HASH, SRC_TX_HASH);

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(4500);
    await Promise.resolve();
    await Promise.resolve();

    const results = emittedEvents.filter((e) => e.type === "result");
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].summary).toMatch(/bridge failed/i);
    expect(results[0].recovery).toMatchObject({
      kind: "link",
      url: `https://li.quest/recovery/${SRC_TX_HASH}`,
      label: expect.stringContaining("Li.Fi"),
    });
    expect(store._records[SRC_TX_HASH].lastStatus).toBe("FAILED");
  });

  // ── Case 3: PENDING → INVALID ───────────────────────────────────────────────
  it("PENDING → INVALID: terminal ok:false, message references 'source tx'", async () => {
    mockLifiFetch
      .mockResolvedValueOnce({ status: "PENDING" })
      .mockResolvedValueOnce({ status: "INVALID" });

    const emittedEvents: any[] = [];
    const emit: Emit = (e) => emittedEvents.push(e);
    const store = makeStore();
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    poller.start(SRC_TX_HASH, SRC_TX_HASH);

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(4500);
    await Promise.resolve();
    await Promise.resolve();

    const results = emittedEvents.filter((e) => e.type === "result");
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].summary.toLowerCase()).toMatch(/source tx|locate/);
    expect(store._records[SRC_TX_HASH].lastStatus).toBe("INVALID");
  });

  // ── Case 4: TIMEOUT ──────────────────────────────────────────────────────────
  it("All PENDING past 15-min timeout: terminal ok:false, summary mentions 15 minutes, recovery URL is /tx/", async () => {
    // Always PENDING
    mockLifiFetch.mockResolvedValue({ status: "PENDING" });

    const emittedEvents: any[] = [];
    const emit: Emit = (e) => emittedEvents.push(e);
    const store = makeStore();
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    poller.start(SRC_TX_HASH, SRC_TX_HASH);

    // Advance past 15 min + 1 extra tick
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 20000);
    await Promise.resolve();
    await Promise.resolve();

    const results = emittedEvents.filter((e) => e.type === "result");
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].summary).toMatch(/15 min/i);
    expect(results[0].recovery).toMatchObject({
      kind: "link",
      url: `https://li.quest/tx/${SRC_TX_HASH}`,
    });
    // Store entry is TIMEOUT
    expect(store._records[SRC_TX_HASH].lastStatus).toBe("TIMEOUT");
  });

  // ── Case 5: Backoff cadence ──────────────────────────────────────────────────
  it("backoff cadence: [3000, 4500, 6750, 10125, 15000, 15000, ...]", async () => {
    const callTimes: number[] = [];
    const startTime = Date.now(); // capture fake-timer start

    // Record call times from the very start
    mockLifiFetch.mockImplementation(async () => {
      callTimes.push(Date.now() - startTime); // relative ms from start
      return { status: "PENDING" };
    });

    const emit: Emit = vi.fn();
    const store = makeStore();
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    poller.start(SRC_TX_HASH, SRC_TX_HASH);

    // Advance through first 6 expected ticks
    // Cumulative: 3000, 7500, 14250, 24375, 39375, 54375
    const expectedDelays = [3000, 4500, 6750, 10125, 15000, 15000];
    for (const delay of expectedDelays) {
      await vi.advanceTimersByTimeAsync(delay);
      await Promise.resolve();
      await Promise.resolve();
    }

    // Should have at least 5 calls
    expect(callTimes.length).toBeGreaterThanOrEqual(5);

    // callTimes are relative ms from start:
    // call[0] fires at t≈3000
    // call[1] fires at t≈7500
    // call[2] fires at t≈14250
    // call[3] fires at t≈24375
    // call[4] fires at t≈39375
    // Inter-call deltas: [4500, 6750, 10125, 15000, ...]
    const deltas = callTimes.slice(1).map((t, i) => t - callTimes[i]!);

    // First call ~ 3000ms from start
    expect(callTimes[0]).toBeGreaterThanOrEqual(2950);
    expect(callTimes[0]).toBeLessThanOrEqual(3050);

    // delta[0]: between 1st and 2nd call = 4500ms
    expect(deltas[0]).toBeGreaterThanOrEqual(4450);
    expect(deltas[0]).toBeLessThanOrEqual(4550);
    // delta[1]: between 2nd and 3rd call = 6750ms
    expect(deltas[1]).toBeGreaterThanOrEqual(6700);
    expect(deltas[1]).toBeLessThanOrEqual(6800);
    // delta[2]: between 3rd and 4th call = 10125ms
    expect(deltas[2]).toBeGreaterThanOrEqual(10075);
    expect(deltas[2]).toBeLessThanOrEqual(10175);
    // delta[3]: capped at 15000ms
    if (deltas.length >= 4) {
      expect(deltas[3]).toBeGreaterThanOrEqual(14950);
      expect(deltas[3]).toBeLessThanOrEqual(15050);
    }
  });

  // ── Case 6: Abort ────────────────────────────────────────────────────────────
  it("abort after first poll: no further lifiFetch calls, no terminal event", async () => {
    let callCount = 0;
    mockLifiFetch.mockImplementation(async () => {
      callCount++;
      return { status: "PENDING" };
    });

    const emittedEvents: any[] = [];
    const emit: Emit = (e) => emittedEvents.push(e);
    const store = makeStore();
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    const controller = poller.start(SRC_TX_HASH, SRC_TX_HASH);

    // First tick fires
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();

    // Abort after first poll
    controller.abort();

    // Advance more — should not trigger further fetches
    await vi.advanceTimersByTimeAsync(30000);
    await Promise.resolve();
    await Promise.resolve();

    expect(callCount).toBe(1);
    // No terminal result event
    const results = emittedEvents.filter((e) => e.type === "result");
    expect(results.length).toBe(0);
    // Store retains PENDING
    expect(store._records[SRC_TX_HASH].lastStatus).toBe("PENDING");
  });

  // ── Case 7: Network error retry ──────────────────────────────────────────────
  it("network error on first call → retries with backoff → completes with DONE on second", async () => {
    mockLifiFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        status: "DONE",
        receiving: { txHash: DEST_TX_HASH, amount: "990000000" },
        sending: { txHash: SRC_TX_HASH },
      });

    const emittedEvents: any[] = [];
    const emit: Emit = (e) => emittedEvents.push(e);
    const store = makeStore();
    store._records[SRC_TX_HASH] = { lastStatus: "PENDING" };

    const poller = new LifiStatusPoller(BASE_OBS, store, emit);
    poller.start(SRC_TX_HASH, SRC_TX_HASH);

    // First tick at 3000ms — throws, schedules retry at 4500ms
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    await Promise.resolve();

    // Second tick at 4500ms — returns DONE
    await vi.advanceTimersByTimeAsync(4500);
    await Promise.resolve();
    await Promise.resolve();

    const results = emittedEvents.filter((e) => e.type === "result");
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(true);
    expect(store._records[SRC_TX_HASH].lastStatus).toBe("DONE");
  });
});
