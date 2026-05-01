// apps/web/server/uniswapClients.ts
import { createPublicClient, http } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, sepolia } from "viem/chains";
import { tradingApiStrategy } from "@plugins/uniswap/strategies/tradingApi";
import { directV3Strategy }   from "@plugins/uniswap/strategies/directV3";

const UNICHAIN = {
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.unichain.org"] } },
} as const;

const CHAIN_BY_ID: Record<number, any> = {
  1: mainnet, 8453: base, 42161: arbitrum, 10: optimism, 137: polygon, 11155111: sepolia, 130: UNICHAIN,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publicClientFor(chainId: number): any {
  const c = CHAIN_BY_ID[chainId];
  if (!c) throw new Error(`no rpc configured for chain ${chainId}`);
  const rpcUrl = process.env[`RPC_URL_${chainId}`] ?? c.rpcUrls?.default?.http?.[0];
  return createPublicClient({ chain: c, transport: http(rpcUrl) });
}

export function uniswapStrategies(chainId: number) {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) throw new Error("UNISWAP_API_KEY missing");
  return {
    tradingApi: tradingApiStrategy({ apiKey }),
    directV3:   directV3Strategy({ publicClient: publicClientFor(chainId) }),
  };
}
