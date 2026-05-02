import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { erc20Abi } from "@plugins/uniswap/abis/erc20";
import { resolveAsset } from "@plugins/uniswap/resolveAsset";
import { publicClientFor } from "@/server/uniswapClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatBalance(value: bigint, decimals: number): string {
  if (value === 0n) return "0";
  const raw = formatUnits(value, decimals);
  return raw.replace(/(\.[0-9]*?)0+$/, "$1").replace(/\.$/, "");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");
  const chainIdRaw = url.searchParams.get("chainId");
  const tokensRaw = url.searchParams.get("tokens") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "chainId required" }, { status: 400 });
  }

  const tokens = tokensRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return NextResponse.json({ balances: {}, missing: [] });
  }

  const client = publicClientFor(chainId);

  const resolved: Array<{
    symbol: string;
    decimals: number;
    isNative: boolean;
    address: `0x${string}`;
  }> = [];
  const missing: string[] = [];

  for (const sym of tokens) {
    try {
      const a = resolveAsset(chainId, sym);
      resolved.push({
        symbol: sym,
        decimals: a.decimals,
        isNative: a.isNative,
        address: a.address,
      });
    } catch {
      missing.push(sym);
    }
  }

  const nativeEntry = resolved.find((r) => r.isNative);
  const erc20s = resolved.filter((r) => !r.isNative);

  const nativeP = nativeEntry
    ? client.getBalance({ address: address as `0x${string}` })
    : Promise.resolve(0n);

  const mcP =
    erc20s.length > 0
      ? client.multicall({
          contracts: erc20s.map((r) => ({
            address: r.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          })),
          allowFailure: true,
        })
      : Promise.resolve([]);

  const [nativeBal, erc20Results] = await Promise.all([nativeP, mcP]);

  const balances: Record<string, string> = {};

  for (const sym of missing) {
    balances[sym] = "—";
  }

  if (nativeEntry) {
    balances[nativeEntry.symbol] = formatBalance(
      nativeBal as bigint,
      nativeEntry.decimals,
    );
  }

  erc20s.forEach((r, i) => {
    const row = (
      erc20Results as Array<{ status: "success" | "failure"; result?: bigint }>
    )[i];
    if (!row || row.status !== "success" || row.result === undefined) {
      balances[r.symbol] = "—";
      return;
    }
    balances[r.symbol] = formatBalance(row.result, r.decimals);
  });

  return NextResponse.json({ balances, missing });
}
