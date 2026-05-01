import type { Hex } from "viem";
import { getToken, getNative, NATIVE_PLACEHOLDER } from "@wishd/tokens";

export type ResolvedAsset = {
  address: Hex;
  decimals: number;
  isNative: boolean;
  symbol: string;
};

export function resolveAsset(chainId: number, symbol: string): ResolvedAsset {
  const native = getNative(chainId);
  if (native?.symbol === symbol) {
    return { address: NATIVE_PLACEHOLDER as Hex, decimals: native.decimals, isNative: true, symbol };
  }
  const t = getToken(chainId, symbol);
  if (!t) throw new Error(`unsupported asset on chain ${chainId}: ${symbol}`);
  return { address: t.address as Hex, decimals: t.decimals, isNative: false, symbol };
}
