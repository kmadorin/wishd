import { describe, it, expect, expectTypeOf } from "vitest";
import type { Call, EvmCall, SvmCall, SvmTxCall, SvmInstructionsCall } from "./call";
import { isEvmCall, isSvmCall, isSvmTxCall, isSvmInstructionsCall } from "./call";

describe("Call discriminated union", () => {
  const evm: EvmCall = {
    family: "evm",
    caip2: "eip155:1",
    to: "0x0000000000000000000000000000000000000001",
    data: "0xdeadbeef",
    value: 0n,
  };
  const tx: SvmTxCall = {
    family: "svm",
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    kind: "tx",
    base64: "AAAA",
    lastValidBlockHeight: 1n,
  };
  const ix: SvmInstructionsCall = {
    family: "svm",
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    kind: "instructions",
    instructions: [],
    feePayer: "FrXc3Ux0000000000000000000000000000D1HyJ",
    lifetime: { kind: "blockhash", blockhash: "x", lastValidBlockHeight: 1n } as any,
  };

  it("isEvmCall narrows to EvmCall", () => {
    const v: Call = evm;
    if (isEvmCall(v)) expectTypeOf(v).toEqualTypeOf<EvmCall>();
    expect(isEvmCall(evm)).toBe(true);
    expect(isEvmCall(tx)).toBe(false);
  });

  it("isSvmCall narrows to SvmCall", () => {
    const v: Call = tx;
    if (isSvmCall(v)) expectTypeOf(v).toMatchTypeOf<SvmCall>();
    expect(isSvmCall(tx)).toBe(true);
    expect(isSvmCall(ix)).toBe(true);
    expect(isSvmCall(evm)).toBe(false);
  });

  it("isSvmTxCall vs isSvmInstructionsCall", () => {
    expect(isSvmTxCall(tx)).toBe(true);
    expect(isSvmTxCall(ix)).toBe(false);
    expect(isSvmInstructionsCall(ix)).toBe(true);
    expect(isSvmInstructionsCall(tx)).toBe(false);
  });
});
