import { EIP155, SOLANA_MAINNET, SOLANA_DEVNET } from "./caip";

export type ExplorerEntry = {
  caip2: string;
  txUrl: (sig: string) => string;
  addressUrl: (addr: string) => string;
};

const registry = new Map<string, ExplorerEntry>();

const eth = (root: string) => ({
  txUrl: (s: string) => `${root}/tx/${s}`,
  addressUrl: (a: string) => `${root}/address/${a}`,
});

registry.set(EIP155(1),         { caip2: EIP155(1),         ...eth("https://etherscan.io") });
registry.set(EIP155(8453),      { caip2: EIP155(8453),      ...eth("https://basescan.org") });
registry.set(EIP155(42161),     { caip2: EIP155(42161),     ...eth("https://arbiscan.io") });
registry.set(EIP155(10),        { caip2: EIP155(10),        ...eth("https://optimistic.etherscan.io") });
registry.set(EIP155(137),       { caip2: EIP155(137),       ...eth("https://polygonscan.com") });
registry.set(EIP155(130),       { caip2: EIP155(130),       ...eth("https://uniscan.xyz") });
registry.set(EIP155(11155111),  { caip2: EIP155(11155111),  ...eth("https://sepolia.etherscan.io") });
registry.set(SOLANA_MAINNET, {
  caip2: SOLANA_MAINNET,
  txUrl: (s) => `https://solscan.io/tx/${s}`,
  addressUrl: (a) => `https://solscan.io/account/${a}`,
});
registry.set(SOLANA_DEVNET, {
  caip2: SOLANA_DEVNET,
  txUrl: (s) => `https://solscan.io/tx/${s}?cluster=devnet`,
  addressUrl: (a) => `https://solscan.io/account/${a}?cluster=devnet`,
});

export function registerExplorer(e: ExplorerEntry): void { registry.set(e.caip2, e); }
export function explorerTxUrl(caip2: string, sig: string): string {
  return registry.get(caip2)?.txUrl(sig) ?? "";
}
export function explorerAddressUrl(caip2: string, addr: string): string {
  return registry.get(caip2)?.addressUrl(addr) ?? "";
}
