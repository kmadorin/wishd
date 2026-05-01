import { NextResponse } from "next/server";
import { publicClientFor } from "@/server/uniswapClients";
import { resolveAsset } from "@plugins/uniswap/resolveAsset";
import { erc20Abi } from "@plugins/uniswap/abis/erc20";
import { formatUnits } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { chainId, token, address, symbol } = await req.json() as { chainId: number; token: `0x${string}`; address: `0x${string}`; symbol: string };
    const pc = publicClientFor(chainId);
    const a = resolveAsset(chainId, symbol);
    const wei = a.isNative
      ? await pc.getBalance({ address })
      : await pc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }) as bigint;
    return NextResponse.json({ balance: formatUnits(wei, a.decimals) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
