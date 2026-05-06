// plugins/uniswap/strategies/validateCall.ts
import type { Hex } from "viem";
import type { StrategyCall } from "../types";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const HEX  = /^0x[a-fA-F0-9]+$/;

export function validateCall(c: Partial<StrategyCall> | undefined, label: string): asserts c is StrategyCall {
  if (!c) throw new Error(`${label}: missing`);
  if (!c.to || !ADDR.test(c.to)) throw new Error(`${label}: bad to`);
  if (!c.data || !HEX.test(c.data) || c.data === "0x") throw new Error(`${label}: empty calldata`);
  if (typeof c.value !== "string" || !HEX.test(c.value)) throw new Error(`${label}: bad value`);
}

export function ensureHexValue(v: unknown): Hex {
  if (typeof v === "string" && HEX.test(v)) return v as Hex;
  if (typeof v === "string" && /^[0-9]+$/.test(v)) {
    const h = BigInt(v).toString(16);
    return `0x${h}` as Hex;
  }
  throw new Error("invalid value");
}
