import { describe, it, expect } from "vitest";
import { lookup, lookupCaip10, addressShort } from "./addressBook";
import { buildCaip10, EIP155 } from "@wishd/plugin-sdk";
import {
  COMP_SEPOLIA, USDC_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";

const SEPOLIA = EIP155(11155111);

describe("addressBook", () => {
  // --- existing hex-shim tests (must stay green) ---
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

  // --- new CAIP-10 tests ---
  it("lookupCaip10 finds COMP on Sepolia", () => {
    const caip10 = buildCaip10(SEPOLIA, COMP_SEPOLIA.toLowerCase());
    const e = lookupCaip10(caip10);
    expect(e?.label).toBe("COMP");
    expect(e?.decimals).toBe(18);
  });

  it("lookupCaip10 returns null for unknown caip10", () => {
    const unknown = buildCaip10(SEPOLIA, "0x000000000000000000000000000000000000dead");
    expect(lookupCaip10(unknown)).toBeNull();
  });

  it("addressShort handles base58 Solana address", () => {
    const solAddr = "FrXc3Ux0000000000000000000000000000D1HyJ";
    const short = addressShort(solAddr);
    // first 6 chars + … + last 5 chars
    expect(short).toBe("FrXc3U…D1HyJ");
  });

  it("addressShort handles standard hex address", () => {
    const short = addressShort("0xA6c8D1c55951e8AC44a0EaA959Be5Fd21cc07531");
    expect(short).toMatch(/^0x[A-Fa-f0-9]{4}…[A-Fa-f0-9]{4}$/);
  });
});
