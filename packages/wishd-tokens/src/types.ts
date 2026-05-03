import type { TokenInfo as UniswapTokenInfo, TokenList } from "@uniswap/token-lists/src/types";

export type Address = `0x${string}`;
export type TokenInfo = UniswapTokenInfo;
export type { TokenList };
