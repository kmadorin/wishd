import { describe, it, expect } from "vitest";
import { mockSolanaRpc } from "./testing";

describe("mockSolanaRpc", () => {
  it("each method is a vi.fn returning { send } with overridable resolved value", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValueOnce({ send: () => Promise.resolve({ value: 42n }) } as any);
    expect(await rpc.getBalance("addr").send()).toEqual({ value: 42n });
  });

  it("default returns sensible empty shapes", async () => {
    const rpc = mockSolanaRpc();
    expect(await rpc.getRecentPrioritizationFees([]).send()).toEqual([]);
    expect(await rpc.getBlockHeight().send()).toEqual(0n);
  });

  it("sendTransaction default returns deterministic signature", async () => {
    const rpc = mockSolanaRpc();
    expect(await rpc.sendTransaction("xxx").send()).toBe("MOCK_SIG");
  });
});
