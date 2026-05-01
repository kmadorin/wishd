import { describe, it, expect } from "vitest";
import { tokenIconClass, tokenSymbol } from "./tokenIcons";

describe("tokenIcons", () => {
  it("maps known tokens to color classes", () => {
    expect(tokenIconClass("USDC")).toBe("asset-dot usdc");
    expect(tokenIconClass("eth")).toBe("asset-dot eth");
    expect(tokenIconClass("XYZ")).toBe("asset-dot default");
  });

  it("returns glyph for known tokens, ticker fallback otherwise", () => {
    expect(tokenSymbol("ETH")).toBe("Ξ");
    expect(tokenSymbol("USDC")).toBe("$");
    expect(tokenSymbol("ZZZ")).toBe("Z");
  });
});
