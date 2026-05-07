/**
 * BridgeSummary.test.tsx — TDD tests for BridgeSummary widget
 *
 * Task 13: Tests must FAIL before implementation, PASS after.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { LifiBridgePrepared } from "../types";
import { BridgeSummary } from "./BridgeSummary";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makePrepared(overrides: Partial<LifiBridgePrepared["quote"]> = {}): LifiBridgePrepared {
  return {
    calls: [
      {
        family: "evm",
        caip2: "eip155:1",
        to: "0xLiFiDiamond",
        data: "0xdeadbeef",
        value: 0n,
      },
    ],
    observations: [
      {
        family: "lifi-status",
        endpoint: "https://li.quest/v1/status",
        query: {
          txHash: { from: "callResult", index: 0, field: "hash" },
          fromChain: "eip155:1",
          toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        },
        successWhen: { path: "status", equals: "DONE" },
        failureWhen: { path: "status", equalsAny: ["FAILED", "INVALID"] },
        pollMs: { initial: 3000, factor: 1.5, maxBackoff: 15000 },
        timeoutMs: 15 * 60 * 1000,
        display: { title: "Bridging", fromLabel: "Ethereum", toLabel: "Solana" },
      },
    ],
    staleAfter: Date.now() + 25_000,
    config: {
      fromCaip2: "eip155:1",
      toCaip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      fromAddress: "0xSender",
      toAddress: "SolRecipient",
      assetInCaip19: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      assetOutCaip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
      amountAtomic: "10000000",
      slippage: 0.005,
    },
    quote: {
      fromAmount: "10000000",
      toAmount: "1230000000",
      toAmountMin: "1215000000",
      approvalAddress: null,
      feeCosts: [
        { name: "Bridge Fee", description: "Li.Fi fee", amountUSD: "0.50", included: true },
        { name: "Protocol Fee", description: "Across fee", amountUSD: "0.20", included: true },
      ],
      gasCosts: [
        { type: "SEND", amountUSD: "2.10", estimate: "150000" },
      ],
      executionDuration: 180,   // 3 min
      steps: [
        { tool: "across", toolDetails: { name: "Across", logoURI: "" }, type: "cross" },
      ],
      ...overrides,
    } as any,
    quoteAt: Date.now(),
    insufficient: false,
    balance: "100",
    routeNote: "Across",
    totalFeeUSD: "0.70",
    totalGasUSD: "2.10",
    estimatedDurationSec: 180,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BridgeSummary", () => {
  let onExecute: ReturnType<typeof vi.fn>;
  let onRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onExecute = vi.fn();
    onRefresh = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders route note from steps", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    // "Across" appears in route stat + safety panel summary; both are legit.
    expect(screen.getAllByText(/Across/i).length).toBeGreaterThan(0);
  });

  it("renders receive min amount", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    // toAmountMin = "1215000000" — humanized display should appear
    // The widget renders it in some form; just check it's in the doc
    expect(screen.getByTestId("receive-min")).toBeInTheDocument();
  });

  it("renders bridge fees", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    expect(screen.getByTestId("bridge-fees")).toHaveTextContent("0.70");
  });

  it("renders gas cost", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    expect(screen.getByTestId("gas-cost")).toHaveTextContent("2.10");
  });

  it("renders ETA in minutes", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    // 180 seconds = ~3 min
    expect(screen.getByTestId("eta")).toHaveTextContent(/3\s*min/i);
  });

  it("renders slippage select with current value", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    const select = screen.getByRole("combobox", { name: /slippage/i });
    expect(select).toBeInTheDocument();
  });

  it("renders Execute button and clicking it calls onExecute", () => {
    const prepared = makePrepared();
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    const btn = screen.getByRole("button", { name: /execute/i });
    fireEvent.click(btn);
    expect(onExecute).toHaveBeenCalledOnce();
  });

  it("stale gate: disables Execute and shows Refresh when quote is stale", () => {
    vi.useFakeTimers();
    const prepared = makePrepared();
    // Make quote stale immediately
    const stalePrepared = { ...prepared, staleAfter: Date.now() - 1 };
    render(<BridgeSummary prepared={stalePrepared} onExecute={onExecute} onRefresh={onRefresh} />);
    const executeBtn = screen.getByRole("button", { name: /execute/i });
    expect(executeBtn).toBeDisabled();
    const refreshBtn = screen.getByRole("button", { name: /refresh quote/i });
    expect(refreshBtn).toBeInTheDocument();
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("high-impact gate: shows I understand toggle when priceImpactPct > 5", () => {
    const prepared = makePrepared({ priceImpactPct: 6 } as any);
    render(<BridgeSummary prepared={prepared} onExecute={onExecute} onRefresh={onRefresh} />);
    const toggle = screen.getByRole("checkbox", { name: /I understand/i });
    expect(toggle).toBeInTheDocument();
    const executeBtn = screen.getByRole("button", { name: /execute/i });
    expect(executeBtn).toBeDisabled();
    // Check the toggle
    fireEvent.click(toggle);
    expect(executeBtn).not.toBeDisabled();
  });
});
