import { NextResponse } from "next/server";
import { uniswapStrategies } from "@/server/uniswapClients";
import { resolveAsset } from "@plugins/uniswap/resolveAsset";
import { parseUnits } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      chainId: number;
      tokenIn: `0x${string}`;
      tokenOut: `0x${string}`;
      amountIn: string;
      swapper: `0x${string}`;
      slippageBps: number;
      assetIn: string;
      assetOut: string;
    };
    const tag: "direct-v3" | "trading-api" = body.chainId === 11155111 ? "direct-v3" : "trading-api";
    const strat = uniswapStrategies(body.chainId);
    const decIn = resolveAsset(body.chainId, body.assetIn).decimals;
    const cfg = {
      ...body,
      amountIn: tag === "trading-api" ? parseUnits(body.amountIn, decIn).toString() : body.amountIn,
      strategyTag: tag,
    };
    const quote = await (tag === "trading-api" ? strat.tradingApi.quote(cfg as any) : strat.directV3.quote(cfg as any));
    return NextResponse.json(quote);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /no_route|insufficient/.test(msg) ? 422
                : /unsupported|invalid|required/.test(msg) ? 400
                : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
