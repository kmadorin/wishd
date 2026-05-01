import { parseUnits, formatUnits } from "viem";

export const toWei = (h: string, t: { decimals: number }) => parseUnits(h, t.decimals);
export const fromWei = (w: bigint, t: { decimals: number }) => formatUnits(w, t.decimals);
