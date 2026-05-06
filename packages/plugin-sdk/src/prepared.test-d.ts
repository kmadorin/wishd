import { describe, it, expectTypeOf } from "vitest";
import type { Prepared } from "./prepared";
import type { Call, EvmCall, SvmCall } from "./call";

describe("Prepared<TExtras>", () => {
  it("calls is required Call[]", () => {
    type P = Prepared;
    expectTypeOf<P["calls"]>().toEqualTypeOf<Call[]>();
  });

  it("extras merge into outer object", () => {
    type P = Prepared<{ initialQuote: string; balance: string }>;
    expectTypeOf<P["initialQuote"]>().toEqualTypeOf<string>();
    expectTypeOf<P["balance"]>().toEqualTypeOf<string>();
  });

  it("Call narrows by family", () => {
    const c: Call = {} as any;
    if (c.family === "evm") expectTypeOf(c).toEqualTypeOf<EvmCall>();
    else expectTypeOf(c).toEqualTypeOf<SvmCall>();
  });
});
