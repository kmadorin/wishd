import { describe, it, expect } from "vitest";
import { lookup, addressShort } from "./addressBook";
import {
  COMP_SEPOLIA, USDC_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";

describe("addressBook", () => {
  it("returns label + decimals for a known token", () => {
    const e = lookup(COMP_SEPOLIA);
    expect(e?.label).toBe("COMP");
    expect(e?.decimals).toBe(18);
  });

  it("returns null for an unknown address", () => {
    expect(lookup("0x000000000000000000000000000000000000dEaD" as any)).toBeNull();
  });

  it("addressShort renders 0xfirst…last4", () => {
    expect(addressShort(USDC_SEPOLIA)).toMatch(/^0x[A-Fa-f0-9]{4}…[A-Fa-f0-9]{4}$/);
  });
});
