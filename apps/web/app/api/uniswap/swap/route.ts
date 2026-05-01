import { NextResponse } from "next/server";
import { uniswapStrategies } from "@/server/uniswapClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { config, quote } = await req.json();
    const strat = uniswapStrategies(config.chainId);
    const out = await (config.strategyTag === "trading-api" ? strat.tradingApi.swap({ config, quote }) : strat.directV3.swap({ config, quote }));
    return NextResponse.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /calldata|invalid|unsupported_routing/.test(msg) ? 422 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
