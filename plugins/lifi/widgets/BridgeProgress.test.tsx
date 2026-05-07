/**
 * BridgeProgress.test.tsx — TDD tests for BridgeProgress widget
 *
 * Task 15: Mock LifiStatusPoller, useEmit, seed useBridgeProgressStore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock LifiStatusPoller
const mockStart = vi.fn();
const mockAbort = vi.fn();
const mockAbortController = { abort: mockAbort, signal: {} as AbortSignal };

vi.mock("../observe", () => ({
  LifiStatusPoller: vi.fn().mockImplementation(() => ({
    start: mockStart.mockReturnValue(mockAbortController),
  })),
  fetchLifiStatus: vi.fn(),
}));

// Mock useEmit
const mockEmit = vi.fn();
vi.mock("@wishd/plugin-sdk", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useEmit: () => mockEmit,
    explorerTxUrl: (caip2: string, hash: string) => {
      if (caip2.startsWith("eip155:1")) return `https://etherscan.io/tx/${hash}`;
      if (caip2.startsWith("solana:")) return `https://solscan.io/tx/${hash}`;
      return "";
    },
  };
});

// Mock @wishd/plugin-sdk/routes to avoid wagmi deps
vi.mock("@wishd/plugin-sdk/routes", () => ({
  callPluginTool: vi.fn(),
  registerPluginTool: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

import { createBridgeProgressStore } from "../store/bridgeProgressStore";
import type { BridgeRecord } from "../store/bridgeProgressStore";
import type { LifiStatusObservation } from "../types";

// We'll use actual store but seed it before each test
import * as storeModule from "../store/bridgeProgressStore";

const TEST_OBS: LifiStatusObservation = {
  family: "lifi-status",
  endpoint: "https://li.quest/v1/status",
  query: {
    txHash: "0xSrcTx",
    fromChain: "eip155:1",
    toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  },
  successWhen: { path: "status", equals: "DONE" },
  failureWhen: { path: "status", equalsAny: ["FAILED", "INVALID"] },
  pollMs: { initial: 3000, factor: 1.5, maxBackoff: 15000 },
  timeoutMs: 15 * 60 * 1000,
  display: { title: "Bridging", fromLabel: "Ethereum", toLabel: "Solana" },
};

function makePendingRecord(overrides: Partial<BridgeRecord> = {}): BridgeRecord {
  return {
    id: "0xSrcTx",
    config: {
      fromCaip2: "eip155:1",
      toCaip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      fromAddress: "0xSender",
      toAddress: "SolRecipient",
      assetInCaip19: "eip155:1/erc20:0xUSDC",
      assetOutCaip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
      amountAtomic: "10000000",
      slippage: 0.005,
    },
    observation: TEST_OBS,
    startedAt: Date.now() - 10000,
    lastStatus: "PENDING",
    ...overrides,
  };
}

// Import component after mocks
import { BridgeProgress } from "./BridgeProgress";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Re-import the mock class reference
import { LifiStatusPoller as MockedPoller } from "../observe";

describe("BridgeProgress", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockStart.mockReturnValue(mockAbortController);
    // Re-apply constructor mock implementation after reset
    (MockedPoller as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      start: mockStart,
    }));
    // Reset store to empty state
    storeModule.useBridgeProgressStore.setState({ records: {} });
  });

  it("PENDING record: mounts poller and renders ExecuteTimeline", () => {
    storeModule.useBridgeProgressStore.setState({
      records: { "0xSrcTx": makePendingRecord() },
    });
    render(<BridgeProgress id="0xSrcTx" />);
    // Poller should have been started
    expect(mockStart).toHaveBeenCalledWith("0xSrcTx", "0xSrcTx");
    // Timeline should show steps
    expect(screen.getByText(/source signed/i)).toBeInTheDocument();
    expect(screen.getByText(/source confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/bridge processing/i)).toBeInTheDocument();
    expect(screen.getByText(/destination delivered/i)).toBeInTheDocument();
  });

  it("PENDING record: aborts controller on unmount", () => {
    storeModule.useBridgeProgressStore.setState({
      records: { "0xSrcTx": makePendingRecord() },
    });
    const { unmount } = render(<BridgeProgress id="0xSrcTx" />);
    unmount();
    expect(mockAbort).toHaveBeenCalled();
  });

  it("DONE record: does NOT start poller; renders explorer links", () => {
    storeModule.useBridgeProgressStore.setState({
      records: {
        "0xSrcTx": makePendingRecord({
          lastStatus: "DONE",
          destTxHash: "destTxHashValue",
        }),
      },
    });
    render(<BridgeProgress id="0xSrcTx" />);
    expect(mockStart).not.toHaveBeenCalled();
    // Explorer links
    const srcLink = screen.getByTestId("src-explorer-link");
    expect(srcLink).toHaveAttribute("href", expect.stringContaining("0xSrcTx"));
    const destLink = screen.getByTestId("dest-explorer-link");
    expect(destLink).toHaveAttribute("href", expect.stringContaining("destTxHashValue"));
  });

  it("FAILED record: renders recovery link with correct URL", () => {
    storeModule.useBridgeProgressStore.setState({
      records: {
        "0xSrcTx": makePendingRecord({ lastStatus: "FAILED" }),
      },
    });
    render(<BridgeProgress id="0xSrcTx" />);
    expect(mockStart).not.toHaveBeenCalled();
    const link = screen.getByTestId("recovery-link");
    expect(link).toHaveAttribute("href", "https://li.quest/recovery/0xSrcTx");
    expect(screen.getByText(/bridge failed/i)).toBeInTheDocument();
  });

  it("TIMEOUT record: renders Li.Fi link and Resume polling button", () => {
    storeModule.useBridgeProgressStore.setState({
      records: {
        "0xSrcTx": makePendingRecord({ lastStatus: "TIMEOUT" }),
      },
    });
    render(<BridgeProgress id="0xSrcTx" />);
    const timeoutLink = screen.getByTestId("timeout-link");
    expect(timeoutLink).toHaveAttribute("href", "https://li.quest/tx/0xSrcTx");
    expect(screen.getByText(/still pending.*15 min/i)).toBeInTheDocument();
    expect(screen.getByTestId("resume-polling")).toBeInTheDocument();
  });

  it("missing record: renders fallback empty state", () => {
    // Store has no record for this id
    render(<BridgeProgress id="0xNonExistent" />);
    expect(screen.getByText(/no bridge in progress/i)).toBeInTheDocument();
  });
});
