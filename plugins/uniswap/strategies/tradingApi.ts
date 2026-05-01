// plugins/uniswap/strategies/tradingApi.ts
import type { Hex } from "viem";
import type { SwapConfig, SwapQuote, Call } from "../types";
import { SwapError } from "../types";
import { fetchWithRetry, type RetryOpts } from "./fetchWithRetry";
import { validateCall, ensureHexValue } from "./validateCall";

const BASE = "https://trade-api.gateway.uniswap.org/v1";
const ETH = "0x0000000000000000000000000000000000000000";

export type TradingApiOpts = { apiKey: string; fetchImpl?: typeof fetch; retry?: RetryOpts };

export function tradingApiStrategy(opts: TradingApiOpts) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "x-universal-router-version": "2.0",
  };
  const post = (path: string, body: unknown) =>
    fetchWithRetry(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) }, { ...opts.retry, fetchImpl: opts.fetchImpl });

  async function checkApproval(input: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }): Promise<{ approvalCall: Call | null }> {
    if (input.token.toLowerCase() === ETH) return { approvalCall: null };
    const r = await post("/check_approval", {
      walletAddress: input.walletAddress,
      token: input.token,
      amount: input.amountWei,
      chainId: String(input.chainId),
    });
    const j = await r.json() as { approval: { to: Hex; data: Hex; value?: Hex } | null };
    if (!j.approval) return { approvalCall: null };
    const call: Call = { to: j.approval.to, data: j.approval.data, value: ensureHexValue(j.approval.value ?? "0x0") };
    validateCall(call, "approvalCall");
    return { approvalCall: call };
  }

  async function quote(cfg: SwapConfig): Promise<SwapQuote> {
    const r = await post("/quote", {
      swapper: cfg.swapper,
      tokenIn:  cfg.tokenIn,
      tokenOut: cfg.tokenOut,
      tokenInChainId:  String(cfg.chainId),
      tokenOutChainId: String(cfg.chainId),
      amount: cfg.amountIn,                            // caller passes wei string
      type: "EXACT_INPUT",
      slippageTolerance: cfg.slippageBps / 100,
      routingPreference: "CLASSIC",
      protocols: ["V2", "V3", "V4"],
      deadline: Math.floor(Date.now() / 1000) + 300,
    });
    const j = await r.json() as any;
    if (j.routing !== "CLASSIC" && j.routing !== "WRAP" && j.routing !== "UNWRAP") {
      throw new SwapError("unsupported_routing", j.routing ?? "missing");
    }
    return {
      amountIn:     j.quote?.input?.amount ?? cfg.amountIn,
      amountOut:    j.quote?.output?.amount ?? "0",
      amountOutMin: j.quote?.minOutput?.amount ?? j.quote?.output?.amount ?? "0",
      rate:         j.quote?.rate ?? "",
      route:        j.quote?.routeString ?? "Uniswap (Trading API)",
      gasFeeUSD:    j.quote?.gasFeeUSD,
      networkFee:   j.quote?.gasFeeUSD,
      priceImpactBps: typeof j.quote?.priceImpact === "number" ? Math.round(j.quote.priceImpact * 100) : undefined,
      expiresAt:    (j.quote?.deadline ?? (Math.floor(Date.now()/1000) + 30)) * 1000,
      raw:          j,
    };
  }

  async function swap(input: { config: SwapConfig; quote: SwapQuote }): Promise<{ swapCall: Call; approvalStillRequired: boolean }> {
    const { permitData: _pd, permitTransaction: _pt, ...cleanQuote } = (input.quote.raw as Record<string, unknown>) ?? {};
    const r = await post("/swap", cleanQuote);
    const j = await r.json() as { swap: { to: Hex; data: Hex; value?: Hex; from?: Hex } };
    const call: Call = { to: j.swap.to, data: j.swap.data, value: ensureHexValue(j.swap.value ?? "0x0") };
    validateCall(call, "swapCall");
    const approvalCheck = await checkApproval({
      chainId: input.config.chainId,
      walletAddress: input.config.swapper,
      token: input.config.tokenIn,
      amountWei: input.quote.amountIn,
    });
    return { swapCall: call, approvalStillRequired: approvalCheck.approvalCall !== null };
  }

  return { checkApproval, quote, swap };
}
