import { describe, it, expect } from "vitest";
import { explorerTxUrl, explorerAddressUrl, registerExplorer } from "./explorers";
import { EIP155, SOLANA_MAINNET, SOLANA_DEVNET } from "./caip";

describe("explorer registry", () => {
  it("Etherscan tx + address", () => {
    expect(explorerTxUrl(EIP155(1), "0xabc")).toBe("https://etherscan.io/tx/0xabc");
    expect(explorerAddressUrl(EIP155(1), "0xdef")).toBe("https://etherscan.io/address/0xdef");
  });

  it("Base + Arbitrum + Optimism + Unichain + Sepolia covered", () => {
    expect(explorerTxUrl(EIP155(8453), "0x1")).toContain("basescan.org");
    expect(explorerTxUrl(EIP155(42161), "0x1")).toContain("arbiscan.io");
    expect(explorerTxUrl(EIP155(10), "0x1")).toContain("optimistic.etherscan.io");
    expect(explorerTxUrl(EIP155(130), "0x1")).toContain("uniscan.xyz");
    expect(explorerTxUrl(EIP155(11155111), "0x1")).toContain("sepolia.etherscan.io");
  });

  it("Solana mainnet + devnet (with cluster=devnet)", () => {
    expect(explorerTxUrl(SOLANA_MAINNET, "sigA")).toBe("https://solscan.io/tx/sigA");
    expect(explorerTxUrl(SOLANA_DEVNET,  "sigB")).toBe("https://solscan.io/tx/sigB?cluster=devnet");
    expect(explorerAddressUrl(SOLANA_DEVNET, "addrB")).toContain("?cluster=devnet");
  });

  it("registerExplorer extends without SDK edit", () => {
    registerExplorer({
      caip2: "eip155:42220",
      txUrl: (s) => `https://celoscan.io/tx/${s}`,
      addressUrl: (a) => `https://celoscan.io/address/${a}`,
    });
    expect(explorerTxUrl("eip155:42220", "0x9")).toBe("https://celoscan.io/tx/0x9");
  });

  it("unknown caip2 returns empty string", () => {
    expect(explorerTxUrl("eip155:99999", "x")).toBe("");
  });
});
