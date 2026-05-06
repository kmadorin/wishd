import { expectTypeOf, test } from "vitest";
import type { SvmTxCall } from "@wishd/plugin-sdk";
import type { JupiterSwapConfig, JupiterSwapPrepared } from "./types";

test("JupiterSwapPrepared.calls element accepts SvmTxCall", () => {
  type CallElement = JupiterSwapPrepared["calls"][number];
  expectTypeOf<SvmTxCall>().toMatchTypeOf<CallElement>();
});

test("JupiterSwapPrepared.config is JupiterSwapConfig", () => {
  expectTypeOf<JupiterSwapPrepared["config"]>().toEqualTypeOf<JupiterSwapConfig>();
});

test("JupiterSwapPrepared.staleAfter optional number", () => {
  expectTypeOf<JupiterSwapPrepared["staleAfter"]>().toEqualTypeOf<number | undefined>();
});
