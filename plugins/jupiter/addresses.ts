import { SOLANA_MAINNET } from "@wishd/plugin-sdk";

export type CuratedMint = {
  caip19: string;
  mint: string;
  decimals: number;
  isNative: boolean;
};

const NATIVE_SOL_CAIP19 = `${SOLANA_MAINNET}/slip44:501`;
const splCaip19 = (mint: string) => `${SOLANA_MAINNET}/token:${mint}`;

export const CURATED_MINTS: Record<string, CuratedMint> = {
  SOL: {
    caip19: NATIVE_SOL_CAIP19,
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    isNative: true,
  },
  USDC: {
    caip19: splCaip19("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    isNative: false,
  },
  USDT: {
    caip19: splCaip19("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    isNative: false,
  },
  BONK: {
    caip19: splCaip19("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    decimals: 5,
    isNative: false,
  },
  JUP: {
    caip19: splCaip19("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"),
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    decimals: 6,
    isNative: false,
  },
  JTO: {
    caip19: splCaip19("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL"),
    mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
    decimals: 9,
    isNative: false,
  },
  mSOL: {
    caip19: splCaip19("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So"),
    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    decimals: 9,
    isNative: false,
  },
  jupSOL: {
    caip19: splCaip19("jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v"),
    mint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
    decimals: 9,
    isNative: false,
  },
};

export const CURATED_SYMBOLS: string[] = Object.keys(CURATED_MINTS);
export const CURATED_CAIP19: string[] = CURATED_SYMBOLS.map((s) => CURATED_MINTS[s]!.caip19);

export const JUPITER_TOKEN_LIST_URL = "https://tokens.jup.ag/tokens?tags=verified";
