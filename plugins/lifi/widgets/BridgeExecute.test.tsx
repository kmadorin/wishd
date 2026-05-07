/**
 * BridgeExecute.test.tsx — TDD tests for BridgeExecute widget
 *
 * Task 14: Phase machine idle → switch-chain → preflight → approve → submitting → submitted → progress
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { LifiBridgePrepared } from "../types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock wagmi
const mockSendTransaction = vi.fn();
const mockWriteContract = vi.fn();
const mockSwitchChain = vi.fn();

let mockChainId = 1;
let mockIsConnected = true;
let mockAddress = "0xSender";

vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: mockIsConnected, chainId: mockChainId, address: mockAddress }),
  useChainId: () => mockChainId,
  useSwitchChain: () => ({ switchChain: mockSwitchChain }),
  useSendTransaction: () => ({
    sendTransactionAsync: mockSendTransaction,
    isPending: false,
    error: null,
  }),
  useWriteContract: () => ({
    writeContractAsync: mockWriteContract,
    isPending: false,
    error: null,
  }),
}));

// Mock useWishdAccounts
vi.mock("../../../apps/web/lib/wallets/useWishdAccounts", () => ({
  useWishdAccounts: () => ({
    evm: { address: "0xSender", chainId: 1 },
    svm: { address: "SolRecipient" },
    accounts: [],
  }),
}));

// Mock callPluginTool
const mockCallPluginTool = vi.fn();
vi.mock("@wishd/plugin-sdk/routes", () => ({
  callPluginTool: (...args: unknown[]) => mockCallPluginTool(...args),
}));

// Mock BridgeProgress to avoid deep mount
vi.mock("./BridgeProgress", () => ({
  BridgeProgress: ({ id }: { id: string }) => <div data-testid="bridge-progress">{id}</div>,
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makePrepared(overrides: Partial<LifiBridgePrepared> = {}): LifiBridgePrepared {
  return {
    calls: [
      {
        family: "evm",
        caip2: "eip155:1",
        to: "0xLiFiDiamond",
        data: "0xbridgeData",
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
      feeCosts: [],
      gasCosts: [],
      executionDuration: 180,
      steps: [{ tool: "across", toolDetails: { name: "Across", logoURI: "" }, type: "cross" }],
    },
    quoteAt: Date.now(),
    insufficient: false,
    balance: "100",
    routeNote: "Across",
    totalFeeUSD: "0.70",
    totalGasUSD: "2.10",
    estimatedDurationSec: 180,
    ...overrides,
  };
}

function makeTwoCallPrepared(): LifiBridgePrepared {
  return makePrepared({
    calls: [
      {
        family: "evm",
        caip2: "eip155:1",
        to: "0xUSDC",
        data: "0xapproveData",
        value: 0n,
      },
      {
        family: "evm",
        caip2: "eip155:1",
        to: "0xLiFiDiamond",
        data: "0xbridgeData",
        value: 0n,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { BridgeExecute } from "./BridgeExecute";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BridgeExecute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockChainId = 1;
    mockIsConnected = true;
    mockAddress = "0xSender";
  });

  it("shows Switch network button when connected to wrong chain", () => {
    mockChainId = 137; // polygon instead of ethereum
    const prepared = makePrepared();
    render(<BridgeExecute prepared={prepared} />);
    expect(screen.getByRole("button", { name: /switch network/i })).toBeInTheDocument();
  });

  it("calls switchChain when Switch network is clicked", () => {
    mockChainId = 137;
    const prepared = makePrepared();
    render(<BridgeExecute prepared={prepared} />);
    const btn = screen.getByRole("button", { name: /switch network/i });
    fireEvent.click(btn);
    expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: 1 });
  });

  it("single-call: renders Sign & bridge button and calls sendTransaction on click", async () => {
    mockSendTransaction.mockResolvedValueOnce("0xTxHash");
    const prepared = makePrepared();
    render(<BridgeExecute prepared={prepared} />);
    const btn = screen.getByRole("button", { name: /sign.*bridge|bridge/i });
    expect(btn).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(mockSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: "0xLiFiDiamond" }),
    );
  });

  it("single-call: after hash returned, BridgeProgress renders with txHash", async () => {
    mockSendTransaction.mockResolvedValueOnce("0xTxHash123");
    const prepared = makePrepared();
    render(<BridgeExecute prepared={prepared} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign.*bridge|bridge/i }));
    });
    expect(screen.getByTestId("bridge-progress")).toHaveTextContent("0xTxHash123");
  });

  it("two-call: renders Approve button first", () => {
    const prepared = makeTwoCallPrepared();
    render(<BridgeExecute prepared={prepared} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  });

  it("two-call: approval progresses to bridge sign", async () => {
    mockWriteContract.mockResolvedValueOnce("0xApproveTx");
    mockSendTransaction.mockResolvedValueOnce("0xBridgeTx");
    const prepared = makeTwoCallPrepared();
    render(<BridgeExecute prepared={prepared} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    });
    // After approval, bridge button should appear
    expect(await screen.findByRole("button", { name: /sign.*bridge|bridge/i })).toBeInTheDocument();
  });

  it("stale: calls callPluginTool refresh_quote when quote is stale at click time", async () => {
    mockCallPluginTool.mockResolvedValueOnce(makePrepared());
    const stalePrepared = makePrepared({ staleAfter: Date.now() - 1 });
    render(<BridgeExecute prepared={stalePrepared} />);
    // The button label should indicate stale state or allow clicking
    const btn = screen.getByRole("button", { name: /refresh quote|sign.*bridge|bridge/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(mockCallPluginTool).toHaveBeenCalledWith("lifi", "refresh_quote", expect.anything());
  });

  it("submission rejection: shows error message, no record persisted", async () => {
    mockSendTransaction.mockRejectedValueOnce(new Error("user rejected"));
    const prepared = makePrepared();
    render(<BridgeExecute prepared={prepared} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign.*bridge|bridge/i }));
    });
    expect(screen.getByText(/rejected|error/i)).toBeInTheDocument();
    expect(screen.queryByTestId("bridge-progress")).not.toBeInTheDocument();
  });
});
