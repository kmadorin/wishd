export const TOKENS = {
  "11155111": {
    USDC: {
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      symbol: "USDC",
      decimals: 6,
    },
  },
} as const;

export type ChainId = keyof typeof TOKENS;
export type TokenSymbol<C extends ChainId> = keyof (typeof TOKENS)[C];

export function getToken<C extends ChainId, S extends TokenSymbol<C>>(
  chainId: C,
  symbol: S,
): (typeof TOKENS)[C][S] {
  return TOKENS[chainId][symbol];
}
