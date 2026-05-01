import type { ReactNode } from "react";

const CLASS: Record<string, string> = {
  ETH: "eth",
  USDC: "usdc",
  DAI: "dai",
  WBTC: "wbtc",
  USDT: "usdt",
  ARB: "arb",
};
const SYM: Record<string, string> = {
  ETH: "Ξ",
  USDC: "$",
  DAI: "◈",
  WBTC: "₿",
  USDT: "₮",
  ARB: "◆",
  MATIC: "◎",
  OP: "●",
};

export function tokenIconClass(ticker: string): string {
  const k = ticker.toUpperCase();
  return `asset-dot ${CLASS[k] ?? "default"}`;
}

export function tokenSymbol(ticker: string): string {
  const k = ticker.toUpperCase();
  return SYM[k] ?? k.charAt(0);
}

export function TokenDot({ ticker }: { ticker: string }): ReactNode {
  return <span className={tokenIconClass(ticker)}>{tokenSymbol(ticker)}</span>;
}
