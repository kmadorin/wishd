// plugins/lifi/prepare.ts
import { parseUnits, encodeFunctionData, maxUint256 } from "viem";
import { erc20Abi } from "viem";
import { validateBridgeValues } from "./intents";
import { resolveAsset } from "./resolveAsset";
import { defaultDeps } from "./_serverClients";
import type { ServerDeps } from "./_serverClients";
import type {
  LifiBridgePrepared,
  LifiBridgeConfig,
  LifiQuoteEstimate,
  LifiBridgeExtras,
} from "./types";
import type { EvmCall, LifiStatusObservation, Placeholder } from "./types";

export type PrepareBridgeSwapInput = {
  amount: string;
  assetIn: string;
  fromChain: string;
  assetOut: string;
  toChain: string;
  fromAddress: string;
  toAddress: string;
  slippage?: string;
};

function parseSlippage(slippageStr: string | undefined): number {
  if (!slippageStr) return 0.005;
  const trimmed = slippageStr.trim();
  if (trimmed.endsWith("%")) {
    return parseFloat(trimmed.slice(0, -1)) / 100;
  }
  return parseFloat(trimmed);
}

/**
 * Shared core logic: fetch Li.Fi quote, build EvmCalls + observation.
 * Used by both prepareBridgeSwap and refreshBridgeSwap.
 */
export async function quoteAndBuild(
  config: LifiBridgeConfig,
  deps: ServerDeps,
): Promise<LifiBridgePrepared> {
  const { fromCaip2, toCaip2, fromAddress, toAddress, assetInCaip19, assetOutCaip19, amountAtomic, slippage } = config;

  // Extract on-chain addresses from CAIP-19
  // CAIP-19 format: "<caip2>/erc20:<addr>" or "<caip2>/slip44:60" or "<caip2>/token:<mint>"
  function extractAddress(caip19: string): string {
    const parts = caip19.split("/");
    if (parts.length < 2) return caip19;
    const assetPart = parts[1]!;
    if (assetPart.startsWith("erc20:")) return assetPart.slice("erc20:".length);
    if (assetPart.startsWith("token:")) return assetPart.slice("token:".length);
    if (assetPart === "slip44:60") return "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    if (assetPart === "slip44:501") return "So11111111111111111111111111111111111111112";
    return assetPart;
  }

  const fromToken = extractAddress(assetInCaip19);
  const toToken = extractAddress(assetOutCaip19);

  // Map CAIP-2 → Li.Fi chain id. Li.Fi uses numeric IDs for EVM and a fixed
  // numeric ID 1151111081099710 for Solana mainnet.
  const LIFI_SOLANA_CHAIN_ID = 1151111081099710;
  const toLifiChainId = (caip2: string): number | string => {
    if (caip2.startsWith("eip155:")) return parseInt(caip2.slice("eip155:".length), 10);
    if (caip2.startsWith("solana:")) return LIFI_SOLANA_CHAIN_ID;
    return caip2;
  };
  const fromChainId = toLifiChainId(fromCaip2);
  const toChainId = toLifiChainId(toCaip2);

  // Fetch Li.Fi quote
  const quoteJson = await deps.lifiFetch("/quote", {
    search: {
      fromChain: fromChainId,
      toChain: toChainId,
      fromToken,
      toToken,
      fromAddress,
      toAddress,
      fromAmount: amountAtomic,
      slippage,
      integrator: "wishd",
    },
  }) as any;

  const tx = quoteJson.transactionRequest as {
    to: string;
    data: string;
    value: string;
    from?: string;
    gasPrice?: string;
    gasLimit?: string;
    chainId?: number;
  };

  const estimate = quoteJson.estimate as {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string | null;
    feeCosts: Array<{ name: string; description: string; amountUSD: string; included: boolean }>;
    gasCosts: Array<{ type: string; amountUSD: string; estimate: string }>;
    executionDuration: number;
  };

  const steps: Array<{ tool: string; toolDetails: { name: string; logoURI: string }; type: string }> =
    quoteJson.includedSteps ?? quoteJson.steps ?? [];

  // Build calls array
  const calls: EvmCall[] = [];

  const isNativeFrom = fromToken === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  // Check if approval is needed.
  // If the allowance read fails or hangs (default RPC rate-limited), assume
  // approval is needed — safer to prompt user than to hang the prepare flow.
  if (estimate.approvalAddress && !isNativeFrom) {
    const pc = deps.evmPublicClientFor(fromCaip2);
    const amountAtomicBigInt = BigInt(amountAtomic);
    const ALLOWANCE_TIMEOUT_MS = 4000;
    let allowance: bigint = 0n;
    try {
      allowance = await Promise.race([
        pc.readContract({
          address: fromToken as `0x${string}`,
          abi: erc20Abi,
          functionName: "allowance",
          args: [fromAddress as `0x${string}`, estimate.approvalAddress as `0x${string}`],
        }) as Promise<bigint>,
        new Promise<bigint>((_, reject) =>
          setTimeout(() => reject(new Error("allowance read timeout")), ALLOWANCE_TIMEOUT_MS),
        ),
      ]);
    } catch {
      allowance = 0n;
    }

    if (allowance < amountAtomicBigInt) {
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [estimate.approvalAddress as `0x${string}`, maxUint256],
      });

      calls.push({
        family: "evm",
        caip2: fromCaip2,
        to: fromToken as `0x${string}`,
        data: approveData,
        value: 0n,
      });
    }
  }

  const bridgeCallIndex = calls.length;

  // Add the bridge tx call
  calls.push({
    family: "evm",
    caip2: fromCaip2,
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value ?? 0),
  });

  // Build LifiStatusObservation with txHash Placeholder
  const txHashPlaceholder: Placeholder = {
    from: "callResult",
    index: bridgeCallIndex,
    field: "hash",
  };

  const fromLabel = fromCaip2.startsWith("eip155:") ? `Chain ${fromCaip2.split(":")[1]}` : fromCaip2;
  const toLabel = toCaip2.startsWith("solana:") ? "Solana" : `Chain ${toCaip2.split(":")[1]}`;

  const observation: LifiStatusObservation = {
    family: "lifi-status",
    endpoint: "https://li.quest/v1/status",
    query: {
      txHash: txHashPlaceholder,
      fromChain: fromChainId,
      toChain: toChainId,
    },
    successWhen: { path: "status", equals: "DONE" },
    failureWhen: { path: "status", equalsAny: ["FAILED", "INVALID"] },
    pollMs: { initial: 3000, factor: 1.5, maxBackoff: 15000 },
    timeoutMs: 15 * 60 * 1000,
    display: {
      title: "Bridging",
      fromLabel,
      toLabel,
    },
  };

  const quoteAt = Date.now();
  const staleAfter = quoteAt + 25_000;

  // Compute fee/gas totals
  const totalFeeUSD = estimate.feeCosts
    .filter((f) => f.included)
    .reduce((sum, f) => sum + parseFloat(f.amountUSD), 0)
    .toFixed(2);

  const totalGasUSD = estimate.gasCosts
    .reduce((sum, g) => sum + parseFloat(g.amountUSD), 0)
    .toFixed(2);

  const estimatedDurationSec = estimate.executionDuration;

  const routeNote = steps.length > 0
    ? steps.map((s) => s.toolDetails?.name ?? s.tool).join(" → ")
    : undefined;

  const quoteEstimate: LifiQuoteEstimate = {
    fromAmount: estimate.fromAmount,
    toAmount: estimate.toAmount,
    toAmountMin: estimate.toAmountMin,
    approvalAddress: estimate.approvalAddress,
    feeCosts: estimate.feeCosts,
    gasCosts: estimate.gasCosts,
    executionDuration: estimate.executionDuration,
    steps,
  };

  const extras: LifiBridgeExtras = {
    config,
    quote: quoteEstimate,
    quoteAt,
    insufficient: false, // best-effort; caller can update
    balance: "0",        // best-effort; caller can update
    routeNote,
    totalFeeUSD,
    totalGasUSD,
    estimatedDurationSec,
  };

  return {
    ...extras,
    calls,
    observations: [observation],
    staleAfter,
  };
}

/**
 * Prepare a Li.Fi bridge-swap.
 *
 * @param input - user-facing intent values
 * @param deps - server dependencies (lifiFetch, evmPublicClientFor); defaults throw if not injected
 */
export async function prepareBridgeSwap(
  input: PrepareBridgeSwapInput,
  deps: ServerDeps = defaultDeps,
): Promise<LifiBridgePrepared> {
  const { amount, assetIn, fromChain, assetOut, toChain, fromAddress, toAddress, slippage } = input;

  // Step 1: Validate
  const validation = validateBridgeValues({ amount, assetIn, fromChain, assetOut, toChain });
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  // Step 2: Resolve assets
  const [assetInRes, assetOutRes] = await Promise.all([
    resolveAsset(fromChain, assetIn),
    resolveAsset(toChain, assetOut),
  ]);

  // Step 3: Compute atomic amount
  const amountAtomic = parseUnits(amount, assetInRes.decimals).toString();

  // Step 4: Parse slippage
  const slippageNum = parseSlippage(slippage);

  // Step 5: Build config
  const config: LifiBridgeConfig = {
    fromCaip2: fromChain,
    toCaip2: toChain,
    fromAddress,
    toAddress,
    assetInCaip19: assetInRes.caip19,
    assetOutCaip19: assetOutRes.caip19,
    amountAtomic,
    slippage: slippageNum,
  };

  return quoteAndBuild(config, deps);
}
