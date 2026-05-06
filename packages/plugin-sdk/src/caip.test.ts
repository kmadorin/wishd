import { describe, it, expect } from "vitest";
import {
  EIP155, SOLANA_MAINNET, SOLANA_DEVNET,
  isEvmCaip2, isSvmCaip2, evmChainId, humanizeChain,
  parseCaip10, buildCaip10, parseCaip19,
} from "./caip";

describe("caip helpers", () => {
  it("EIP155 builds eip155:<id>", () => {
    expect(EIP155(1)).toBe("eip155:1");
    expect(EIP155(8453)).toBe("eip155:8453");
  });

  it("Solana mainnet/devnet constants are 32-char base58 prefixes", () => {
    expect(SOLANA_MAINNET).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(SOLANA_DEVNET).toBe("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  });

  it("isEvmCaip2 / isSvmCaip2 family guards", () => {
    expect(isEvmCaip2("eip155:1")).toBe(true);
    expect(isEvmCaip2(SOLANA_MAINNET)).toBe(false);
    expect(isSvmCaip2(SOLANA_MAINNET)).toBe(true);
    expect(isSvmCaip2("eip155:1")).toBe(false);
  });

  it("evmChainId extracts numeric id, throws on non-eip155", () => {
    expect(evmChainId("eip155:42161")).toBe(42161);
    expect(() => evmChainId(SOLANA_MAINNET)).toThrow(/eip155/);
  });

  it("humanizeChain returns label for known and raw caip2 for unknown", () => {
    expect(humanizeChain("eip155:1")).toBe("Ethereum");
    expect(humanizeChain("eip155:8453")).toBe("Base");
    expect(humanizeChain("eip155:11155111")).toBe("Sepolia");
    expect(humanizeChain(SOLANA_MAINNET)).toBe("Solana");
    expect(humanizeChain(SOLANA_DEVNET)).toBe("Solana Devnet");
    expect(humanizeChain("eip155:9999")).toBe("eip155:9999");
  });

  it("parseCaip10 / buildCaip10 round-trip", () => {
    const s = "eip155:1:0xAbC0000000000000000000000000000000000001";
    const p = parseCaip10(s);
    expect(p.caip2).toBe("eip155:1");
    expect(p.address).toBe("0xAbC0000000000000000000000000000000000001");
    expect(buildCaip10(p.caip2, p.address)).toBe(s);
  });

  it("parseCaip19 splits chain / namespace / reference", () => {
    const p = parseCaip19("eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(p.caip2).toBe("eip155:1");
    expect(p.assetNamespace).toBe("erc20");
    expect(p.assetReference).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

    const sol = parseCaip19(`${SOLANA_MAINNET}/slip44:501`);
    expect(sol.caip2).toBe(SOLANA_MAINNET);
    expect(sol.assetNamespace).toBe("slip44");
    expect(sol.assetReference).toBe("501");
  });
});
