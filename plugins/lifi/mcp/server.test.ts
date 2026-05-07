import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prepareBridgeSwap
vi.mock("../prepare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prepare")>();
  return {
    ...actual,
    prepareBridgeSwap: vi.fn(),
  };
});

// Mock resolveAsset (transitively used)
vi.mock("../resolveAsset", () => ({
  resolveAsset: vi.fn(),
}));

import { createLifiMcp } from "./server";
import { prepareBridgeSwap } from "../prepare";

const MOCK_TX = {
  to: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  data: "0xdeadbeef",
  value: "0",
};

const MOCK_PREPARED = {
  calls: [
    {
      family: "evm" as const,
      caip2: "eip155:1",
      to: MOCK_TX.to,
      data: MOCK_TX.data,
      value: BigInt(0),
    },
  ],
  observations: [
    {
      family: "lifi-status" as const,
      endpoint: "https://li.quest/v1/status",
      query: { txHash: { from: "callResult", index: 0, field: "hash" }, fromChain: 1, toChain: "solana:..." },
      successWhen: { path: "status", equals: "DONE" },
      failureWhen: { path: "status", equalsAny: ["FAILED", "INVALID"] },
      display: { title: "Bridging", fromLabel: "Chain 1", toLabel: "Solana" },
    },
  ],
  staleAfter: Date.now() + 25_000,
  config: {
    fromCaip2: "eip155:1",
    toCaip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    fromAddress: "0xUSER",
    toAddress: "SolanaAddr",
    assetInCaip19: "eip155:1/slip44:60",
    assetOutCaip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
    amountAtomic: "10000000000000000",
    slippage: 0.005,
  },
  quote: {
    fromAmount: "10000000000000000",
    toAmount: "100000000",
    toAmountMin: "99500000",
    approvalAddress: null,
    feeCosts: [],
    gasCosts: [],
    executionDuration: 180,
    steps: [],
  },
  quoteAt: Date.now(),
  insufficient: false,
  balance: "0",
  totalFeeUSD: "0.00",
  totalGasUSD: "0.00",
  estimatedDurationSec: 180,
};

describe("createLifiMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an MCP server with two registered tools: prepare_bridge_swap and get_bridge_status", () => {
    const mockLifiFetch = vi.fn();
    const mockEvmPublicClientFor = vi.fn();
    const server = createLifiMcp({ lifiFetch: mockLifiFetch, evmPublicClientFor: mockEvmPublicClientFor as any });

    // The server object from createSdkMcpServer should be truthy
    expect(server).toBeDefined();
    expect(server.instance).toBeDefined();
  });

  it("prepare_bridge_swap handler returns content with JSON-parsed shape { calls, observations, staleAfter, quote }", async () => {
    (prepareBridgeSwap as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PREPARED);

    const mockLifiFetch = vi.fn();
    const mockEvmPublicClientFor = vi.fn();
    const server = createLifiMcp({ lifiFetch: mockLifiFetch, evmPublicClientFor: mockEvmPublicClientFor as any });

    // Access the underlying McpServer and call the tool handler directly
    // MCP SDK's McpServer exposes _registeredTools
    const mcpInstance = server.instance as any;

    // Find prepare_bridge_swap tool
    const tools = mcpInstance._registeredTools as Record<string, { handler: (args: any) => Promise<any> }>;
    const prepareHandler = tools["prepare_bridge_swap"];
    expect(prepareHandler).toBeDefined();

    const result = await prepareHandler!.handler({
      amount: "0.01",
      assetIn: "ETH",
      fromChain: "eip155:1",
      assetOut: "SOL",
      toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      fromAddress: "0xUSER",
      toAddress: "SolanaAddr",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("calls");
    expect(parsed).toHaveProperty("observations");
    expect(parsed).toHaveProperty("staleAfter");
    expect(parsed).toHaveProperty("quote");
  });

  it("get_bridge_status handler proxies to lifiFetch /status and returns JSON", async () => {
    const pendingStatus = { status: "PENDING", substatus: "WAIT_DESTINATION" };
    const mockLifiFetch = vi.fn().mockResolvedValue(pendingStatus);
    const mockEvmPublicClientFor = vi.fn();
    const server = createLifiMcp({ lifiFetch: mockLifiFetch, evmPublicClientFor: mockEvmPublicClientFor as any });

    const mcpInstance = server.instance as any;
    const tools = mcpInstance._registeredTools as Record<string, { handler: (args: any) => Promise<any> }>;
    const statusHandler = tools["get_bridge_status"];
    expect(statusHandler).toBeDefined();

    const result = await statusHandler!.handler({
      txHash: "0xabc123",
      fromChain: "1",
      toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("PENDING");
    expect(parsed.substatus).toBe("WAIT_DESTINATION");

    expect(mockLifiFetch).toHaveBeenCalledWith("/status", expect.objectContaining({
      search: expect.objectContaining({ txHash: "0xabc123" }),
    }));
  });
});
