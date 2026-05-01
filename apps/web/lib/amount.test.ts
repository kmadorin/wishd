import { describe, it, expect } from "vitest";
import { toWei, fromWei } from "./amount";

const usdc = { decimals: 6 };
const weth = { decimals: 18 };

describe("amount helpers", () => {
  it("toWei converts decimal string to bigint with token decimals", () => {
    expect(toWei("10", usdc)).toBe(10_000_000n);
    expect(toWei("0.5", usdc)).toBe(500_000n);
    expect(toWei("1", weth)).toBe(10n ** 18n);
  });

  it("fromWei round-trips", () => {
    expect(fromWei(10_000_000n, usdc)).toBe("10");
    expect(fromWei(500_000n, usdc)).toBe("0.5");
  });

  it("toWei handles small fractions for usdc", () => {
    expect(toWei("0.000001", usdc)).toBe(1n);
  });
});
