"use client";
import useSWR from "swr";

export type BalancesMap = Record<string, string>;

export type UseBalancesArgs = {
  chainId: number;
  address: `0x${string}` | string | undefined;
  tokens: string[];
};

const fetcher = async (url: string): Promise<{ balances: BalancesMap }> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`balances fetch failed: ${r.status}`);
  return r.json();
};

export function useBalances({ chainId, address, tokens }: UseBalancesArgs): {
  balances: BalancesMap;
  isLoading: boolean;
  error: Error | undefined;
} {
  const sortedTokens = [...tokens].sort().join(",");
  const key = address && tokens.length > 0
    ? `/api/wallet/balances?address=${address}&chainId=${chainId}&tokens=${sortedTokens}`
    : null;
  const { data, error, isLoading } = useSWR(key, fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });
  return {
    balances: data?.balances ?? {},
    isLoading,
    error: error as Error | undefined,
  };
}
