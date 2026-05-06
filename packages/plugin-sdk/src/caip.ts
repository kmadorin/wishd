export const EIP155 = (id: number): `eip155:${number}` => `eip155:${id}`;

export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;
export const SOLANA_DEVNET  = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;

const HUMAN_LABELS: Record<string, string> = {
  "eip155:1":         "Ethereum",
  "eip155:8453":      "Base",
  "eip155:42161":     "Arbitrum",
  "eip155:10":        "Optimism",
  "eip155:137":       "Polygon",
  "eip155:130":       "Unichain",
  "eip155:11155111":  "Sepolia",
  [SOLANA_MAINNET]:   "Solana",
  [SOLANA_DEVNET]:    "Solana Devnet",
};

export function isEvmCaip2(c: string): boolean { return c.startsWith("eip155:"); }
export function isSvmCaip2(c: string): boolean { return c.startsWith("solana:"); }

export function evmChainId(caip2: string): number {
  if (!isEvmCaip2(caip2)) throw new Error(`not an eip155 caip2: ${caip2}`);
  const n = Number(caip2.slice("eip155:".length));
  if (!Number.isInteger(n)) throw new Error(`malformed eip155 caip2: ${caip2}`);
  return n;
}

export function humanizeChain(caip2: string): string {
  return HUMAN_LABELS[caip2] ?? caip2;
}

export function parseCaip10(s: string): { caip2: string; address: string } {
  // CAIP-10: <namespace>:<reference>:<address>. Address may itself contain ':'? No — CAIP-10 disallows.
  const lastColon = s.lastIndexOf(":");
  if (lastColon < 0) throw new Error(`malformed caip10: ${s}`);
  return { caip2: s.slice(0, lastColon), address: s.slice(lastColon + 1) };
}

export function buildCaip10(caip2: string, address: string): string {
  return `${caip2}:${address}`;
}

export function parseCaip19(s: string): { caip2: string; assetNamespace: string; assetReference: string } {
  const slash = s.indexOf("/");
  if (slash < 0) throw new Error(`malformed caip19: ${s}`);
  const caip2 = s.slice(0, slash);
  const rest  = s.slice(slash + 1);
  const colon = rest.indexOf(":");
  if (colon < 0) throw new Error(`malformed caip19 asset part: ${rest}`);
  return { caip2, assetNamespace: rest.slice(0, colon), assetReference: rest.slice(colon + 1) };
}
