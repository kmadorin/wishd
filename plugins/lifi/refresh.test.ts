import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock resolveAsset (not used by refresh but imported via prepare)
vi.mock("./resolveAsset", () => ({
  resolveAsset: vi.fn(),
}));

import { refreshBridgeSwap } from "./refresh";
import type { LifiBridgeConfig } from "./types";

const MOCK_TX = {
  to: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  data: "0xdeadbeef",
  value: "0",
  from: "0xUSER",
};

const MOCK_QUOTE_RESPONSE = {
  transactionRequest: MOCK_TX,
  estimate: {
    fromAmount: "10000000",
    toAmount: "100000000",
    toAmountMin: "99500000",
    approvalAddress: null,
    feeCosts: [],
    gasCosts: [{ type: "SEND", amountUSD: "1.00", estimate: "200000" }],
    executionDuration: 180,
  },
  includedSteps: [
    { tool: "across", toolDetails: { name: "Across", logoURI: "" }, type: "cross" },
  ],
};

const BRIDGE_CONFIG: LifiBridgeConfig = {
  fromCaip2: "eip155:1",
  toCaip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  fromAddress: "0xUSER",
  toAddress: "SolanaAddr",
  assetInCaip19: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  assetOutCaip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
  amountAtomic: "10000000",
  slippage: 0.005,
};

describe("refreshBridgeSwap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls lifiFetch with same params and returns fresh Prepared with updated quoteAt + staleAfter", async () => {
    const mockLifiFetch = vi.fn().mockResolvedValue(MOCK_QUOTE_RESPONSE);
    const mockEvmPublicClientFor = vi.fn();

    const oldQuoteAt = Date.now() - 30_000; // pretend quote is 30s old (stale)

    const before = Date.now();
    const prepared = await refreshBridgeSwap(
      { config: BRIDGE_CONFIG },
      { lifiFetch: mockLifiFetch, evmPublicClientFor: mockEvmPublicClientFor as any },
    );

    // quoteAt is freshly set
    expect(prepared.quoteAt).toBeGreaterThanOrEqual(before);
    expect(prepared.quoteAt).toBeGreaterThan(oldQuoteAt);

    // staleAfter is 25s after quoteAt
    expect(prepared.staleAfter! - prepared.quoteAt).toBe(25_000);

    // calls is non-empty
    expect(prepared.calls.length).toBe(1);

    // observations is populated
    expect(prepared.observations).toHaveLength(1);
    expect(prepared.observations![0]!.family).toBe("lifi-status");

    // lifiFetch was called
    expect(mockLifiFetch).toHaveBeenCalledOnce();
    const [path] = mockLifiFetch.mock.calls[0] as [string, unknown];
    expect(path).toBe("/quote");
  });

  it("uses config.slippage directly (already a number)", async () => {
    const mockLifiFetch = vi.fn().mockResolvedValue(MOCK_QUOTE_RESPONSE);
    const mockEvmPublicClientFor = vi.fn();

    const configWithSlippage: LifiBridgeConfig = { ...BRIDGE_CONFIG, slippage: 0.01 };

    await refreshBridgeSwap(
      { config: configWithSlippage },
      { lifiFetch: mockLifiFetch, evmPublicClientFor: mockEvmPublicClientFor as any },
    );

    const callArgs = mockLifiFetch.mock.calls[0] as [string, { search: Record<string, unknown> }];
    const [, opts] = callArgs;
    expect(opts.search.slippage).toBe(0.01);
  });
});
