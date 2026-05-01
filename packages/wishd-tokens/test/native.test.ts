import { describe, it, expect } from "vitest";
import { getNative, NATIVE_PLACEHOLDER } from "../src/native";

describe("getNative", () => {
  it("returns MATIC for Polygon", () => {
    expect(getNative(137)?.symbol).toBe("MATIC");
  });

  it("returns WETH as wrappedSymbol for Base", () => {
    expect(getNative(8453)?.wrappedSymbol).toBe("WETH");
  });

  it("returns undefined for unknown chain", () => {
    expect(getNative(99999)).toBeUndefined();
  });

  it("NATIVE_PLACEHOLDER is zero address", () => {
    expect(NATIVE_PLACEHOLDER).toBe("0x0000000000000000000000000000000000000000");
  });
});
