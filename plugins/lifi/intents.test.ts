import { describe, it, expect } from "vitest";
import { lifiIntents, validateBridgeValues } from "./intents";
import { SOLANA_MAINNET } from "./addresses";

describe("lifiIntents", () => {
  it("has the correct shape for lifi.bridge-swap", () => {
    expect(lifiIntents).toHaveLength(1);
    const intent = lifiIntents[0]!;
    expect(intent.intent).toBe("lifi.bridge-swap");
    expect(intent.verb).toBe("bridge");
    expect(intent.widget).toBe("lifi-bridge-summary");
    expect(intent.slot).toBe("flow");
    expect(intent.fields).toHaveLength(6);
  });

  it("has correct field defaults", () => {
    const intent = lifiIntents[0]!;
    const fieldByKey = Object.fromEntries(intent.fields.map((f) => [f.key, f]));
    expect(fieldByKey["assetIn"]?.default).toBe("USDC");
    expect(fieldByKey["fromChain"]?.default).toBe("eip155:1");
    expect(fieldByKey["assetOut"]?.default).toBe("SOL");
    expect(fieldByKey["toChain"]?.default).toBe(SOLANA_MAINNET);
    expect(fieldByKey["slippage"]?.default).toBe("0.5%");
  });
});

describe("validateBridgeValues", () => {
  const validEVMtoSVM = {
    amount: "10",
    assetIn: "USDC",
    fromChain: "eip155:1",
    assetOut: "SOL",
    toChain: SOLANA_MAINNET,
    slippage: "0.5%",
  };

  const validEVMtoEVM = {
    amount: "10",
    assetIn: "USDC",
    fromChain: "eip155:1",
    assetOut: "USDC",
    toChain: "eip155:8453",
    slippage: "0.5%",
  };

  it("returns ok:true for valid EVM→SVM", () => {
    expect(validateBridgeValues(validEVMtoSVM)).toEqual({ ok: true });
  });

  it("returns ok:true for valid EVM→EVM", () => {
    expect(validateBridgeValues(validEVMtoEVM)).toEqual({ ok: true });
  });

  it("rejects SVM as source chain", () => {
    const result = validateBridgeValues({ ...validEVMtoSVM, fromChain: SOLANA_MAINNET });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/source chain must be EVM/i);
    }
  });

  it("rejects identical asset on same chain", () => {
    const result = validateBridgeValues({
      ...validEVMtoEVM,
      assetIn: "USDC",
      assetOut: "USDC",
      fromChain: "eip155:1",
      toChain: "eip155:1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/same asset on same chain/i);
    }
  });

  it("rejects amount = '0'", () => {
    const result = validateBridgeValues({ ...validEVMtoSVM, amount: "0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/amount/i);
    }
  });

  it("rejects amount = 'abc' (NaN)", () => {
    const result = validateBridgeValues({ ...validEVMtoSVM, amount: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/amount/i);
    }
  });

  it("rejects negative amount '-1'", () => {
    const result = validateBridgeValues({ ...validEVMtoSVM, amount: "-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/amount/i);
    }
  });
});
