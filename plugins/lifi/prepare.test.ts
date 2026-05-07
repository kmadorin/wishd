import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPlaceholder } from "@wishd/plugin-sdk";

// Mock resolveAsset
vi.mock("./resolveAsset", () => ({
  resolveAsset: vi.fn(),
}));

import { resolveAsset } from "./resolveAsset";
import { prepareBridgeSwap } from "./prepare";

const USDC_ADDR = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_CAIP19 = "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SOL_ADDR = "So11111111111111111111111111111111111111112";
const SOL_CAIP19 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501";
const ETH_ADDR = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ETH_CAIP19 = "eip155:1/slip44:60";

const MOCK_TX = {
  to: "0xLIFIDIAMOND",
  data: "0xdeadbeef",
  value: "0",
  from: "0xUSER",
  gasPrice: "1000000000",
  gasLimit: "200000",
  chainId: 1,
};

const MOCK_QUOTE_NATIVE = {
  transactionRequest: MOCK_TX,
  estimate: {
    fromAmount: "10000000000000000",
    toAmount: "100000000",
    toAmountMin: "99500000",
    approvalAddress: null,
    feeCosts: [{ name: "Bridge fee", description: "Li.Fi fee", amountUSD: "0.50", included: true }],
    gasCosts: [{ type: "SEND", amountUSD: "1.20", estimate: "200000" }],
    executionDuration: 180,
  },
  includedSteps: [
    { tool: "across", toolDetails: { name: "Across", logoURI: "" }, type: "cross" },
  ],
};

const MOCK_APPROVAL_ADDR = "0x1111111254EEB25477B68fb85Ed929f73A960582";

const MOCK_QUOTE_USDC = {
  transactionRequest: MOCK_TX,
  estimate: {
    ...MOCK_QUOTE_NATIVE.estimate,
    approvalAddress: MOCK_APPROVAL_ADDR,
  },
  includedSteps: MOCK_QUOTE_NATIVE.includedSteps,
};

function buildMockDeps(overrides?: {
  lifiFetch?: ReturnType<typeof vi.fn>;
  evmPublicClientFor?: ReturnType<typeof vi.fn>;
}) {
  const lifiFetch = overrides?.lifiFetch ?? vi.fn().mockResolvedValue(MOCK_QUOTE_NATIVE);
  const mockReadContract = vi.fn().mockResolvedValue(0n);
  const evmPublicClientFor = overrides?.evmPublicClientFor ??
    vi.fn().mockReturnValue({ readContract: mockReadContract });
  return { lifiFetch, evmPublicClientFor };
}

describe("prepareBridgeSwap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Case 1: no approval needed (native source ETH → SOL)", async () => {
    (resolveAsset as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ caip19: ETH_CAIP19, address: ETH_ADDR, decimals: 18, isNative: true })
      .mockResolvedValueOnce({ caip19: SOL_CAIP19, address: SOL_ADDR, decimals: 9, isNative: true });

    const deps = buildMockDeps({ lifiFetch: vi.fn().mockResolvedValue(MOCK_QUOTE_NATIVE) });

    const prepared = await prepareBridgeSwap(
      {
        amount: "0.01",
        assetIn: "ETH",
        fromChain: "eip155:1",
        assetOut: "SOL",
        toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        fromAddress: "0xUSER",
        toAddress: "SolanaAddr",
        slippage: "0.5%",
      },
      deps,
    );

    expect(prepared.calls.length).toBe(1);
    expect(prepared.calls[0]!.family).toBe("evm");
    expect(prepared.calls[0]!.caip2).toBe("eip155:1");
    expect((prepared.calls[0] as any).to).toBe(MOCK_TX.to);
    expect((prepared.calls[0] as any).value).toBe(BigInt(MOCK_TX.value));
    expect(prepared.observations).toHaveLength(1);
    expect(prepared.observations![0]!.family).toBe("lifi-status");
    const obs = prepared.observations![0] as any;
    expect(isPlaceholder(obs.query.txHash)).toBe(true);
    expect(obs.query.txHash.from).toBe("callResult");
    expect(obs.query.txHash.index).toBe(0);
    expect(obs.query.txHash.field).toBe("hash");
    expect(prepared.staleAfter).toBeGreaterThan(Date.now());
    expect(prepared.quote.toAmountMin).toBe(MOCK_QUOTE_NATIVE.estimate.toAmountMin);
  });

  it("Case 2: approval needed (ERC-20 source, allowance insufficient)", async () => {
    (resolveAsset as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ caip19: USDC_CAIP19, address: USDC_ADDR, decimals: 6, isNative: false })
      .mockResolvedValueOnce({ caip19: SOL_CAIP19, address: SOL_ADDR, decimals: 9, isNative: true });

    const mockReadContract = vi.fn().mockResolvedValue(0n);
    const deps = buildMockDeps({
      lifiFetch: vi.fn().mockResolvedValue(MOCK_QUOTE_USDC),
      evmPublicClientFor: vi.fn().mockReturnValue({ readContract: mockReadContract }),
    });

    const prepared = await prepareBridgeSwap(
      {
        amount: "10",
        assetIn: "USDC",
        fromChain: "eip155:1",
        assetOut: "SOL",
        toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        fromAddress: "0xUSER",
        toAddress: "SolanaAddr",
        slippage: "0.5%",
      },
      deps,
    );

    expect(prepared.calls.length).toBe(2);
    // calls[0] is the approval
    const approvalCall = prepared.calls[0] as any;
    expect(approvalCall.to.toLowerCase()).toBe(USDC_ADDR.toLowerCase());
    // calls[1] is the bridge tx
    const bridgeCall = prepared.calls[1] as any;
    expect(bridgeCall.to).toBe(MOCK_TX.to);
    // observation txHash placeholder references the bridge call (index 1)
    const obs = prepared.observations![0] as any;
    expect(obs.query.txHash.index).toBe(1);
  });

  it("Case 3: approval pre-existing (allowance >= amount, skipped)", async () => {
    (resolveAsset as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ caip19: USDC_CAIP19, address: USDC_ADDR, decimals: 6, isNative: false })
      .mockResolvedValueOnce({ caip19: SOL_CAIP19, address: SOL_ADDR, decimals: 9, isNative: true });

    const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    const mockReadContract = vi.fn().mockResolvedValue(maxUint256);
    const deps = buildMockDeps({
      lifiFetch: vi.fn().mockResolvedValue(MOCK_QUOTE_USDC),
      evmPublicClientFor: vi.fn().mockReturnValue({ readContract: mockReadContract }),
    });

    const prepared = await prepareBridgeSwap(
      {
        amount: "10",
        assetIn: "USDC",
        fromChain: "eip155:1",
        assetOut: "SOL",
        toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        fromAddress: "0xUSER",
        toAddress: "SolanaAddr",
        slippage: "0.5%",
      },
      deps,
    );

    expect(prepared.calls.length).toBe(1);
    const obs = prepared.observations![0] as any;
    expect(obs.query.txHash.index).toBe(0);
  });

  it("Case 4: SVM source rejected by validateBridgeValues", async () => {
    const deps = buildMockDeps();

    await expect(
      prepareBridgeSwap(
        {
          amount: "10",
          assetIn: "SOL",
          fromChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          assetOut: "USDC",
          toChain: "eip155:1",
          fromAddress: "SolanaAddr",
          toAddress: "0xUSER",
          slippage: "0.5%",
        },
        deps,
      ),
    ).rejects.toThrowError(/source chain must be EVM/i);
  });

  it("Case 5: slippage forwarding — '1%' → lifiFetch called with slippage=0.01", async () => {
    (resolveAsset as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ caip19: ETH_CAIP19, address: ETH_ADDR, decimals: 18, isNative: true })
      .mockResolvedValueOnce({ caip19: SOL_CAIP19, address: SOL_ADDR, decimals: 9, isNative: true });

    const mockLifiFetch = vi.fn().mockResolvedValue(MOCK_QUOTE_NATIVE);
    const deps = buildMockDeps({ lifiFetch: mockLifiFetch });

    await prepareBridgeSwap(
      {
        amount: "0.01",
        assetIn: "ETH",
        fromChain: "eip155:1",
        assetOut: "SOL",
        toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        fromAddress: "0xUSER",
        toAddress: "SolanaAddr",
        slippage: "1%",
      },
      deps,
    );

    expect(mockLifiFetch).toHaveBeenCalledOnce();
    const callArgs = mockLifiFetch.mock.calls[0] as [string, { search: Record<string, unknown> }];
    const [, opts] = callArgs;
    expect(opts.search.slippage).toBe(0.01);
  });

  it("Case 6: staleAfter headroom is ~25000ms after quoteAt", async () => {
    (resolveAsset as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ caip19: ETH_CAIP19, address: ETH_ADDR, decimals: 18, isNative: true })
      .mockResolvedValueOnce({ caip19: SOL_CAIP19, address: SOL_ADDR, decimals: 9, isNative: true });

    const deps = buildMockDeps();

    const before = Date.now();
    const prepared = await prepareBridgeSwap(
      {
        amount: "0.01",
        assetIn: "ETH",
        fromChain: "eip155:1",
        assetOut: "SOL",
        toChain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        fromAddress: "0xUSER",
        toAddress: "SolanaAddr",
        slippage: "0.5%",
      },
      deps,
    );

    expect(prepared.staleAfter! - prepared.quoteAt).toBe(25_000);
    expect(prepared.quoteAt).toBeGreaterThanOrEqual(before);
  });
});
