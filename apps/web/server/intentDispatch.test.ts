import { describe, it, expect, vi } from "vitest";
import { dispatchIntent } from "./intentDispatch";

const fakePublicClient = {
  readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "allowance") return 0n;
    if (functionName === "balanceOf") return 1_000_000_000n;
    return 0n;
  }),
} as any;

describe("dispatchIntent", () => {
  it("dispatches compound-v3.deposit", async () => {
    const out = await dispatchIntent("compound-v3.deposit", {
      body: { amount: "10", asset: "USDC", chain: "ethereum-sepolia", address: "0x000000000000000000000000000000000000dead" },
      publicClient: fakePublicClient,
    });
    expect(out.widget.type).toBe("compound-summary");
    expect(out.widget.slot).toBe("flow");
    expect(out.widget.id).toMatch(/^w_/);
    expect((out.prepared as any).meta.asset).toBe("USDC");
    expect((out.prepared as any).meta.insufficient).toBe(false);
    expect(out.widget.props).toMatchObject({
      amount: "10",
      asset: "USDC",
      market: "cUSDCv3",
      chainId: 11155111,
    });
  });

  it("dispatches compound-v3.withdraw", async () => {
    fakePublicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") return 1_000_000_000n;
      return 0n;
    });
    const out = await dispatchIntent("compound-v3.withdraw", {
      body: { amount: "5", asset: "USDC", chain: "ethereum-sepolia", address: "0x000000000000000000000000000000000000dead" },
      publicClient: fakePublicClient,
    });
    expect(out.widget.type).toBe("compound-withdraw-summary");
    expect((out.prepared as any).meta.supplied).toBe("1000");
  });

  it("rejects unknown intent", async () => {
    await expect(
      dispatchIntent("x.unknown", { body: { amount: "1" }, publicClient: fakePublicClient }),
    ).rejects.toThrow(/unknown intent/i);
  });

  it("validates required amount", async () => {
    await expect(
      dispatchIntent("compound-v3.deposit", {
        body: { asset: "USDC", chain: "ethereum-sepolia", address: "0x0000000000000000000000000000000000000000" },
        publicClient: fakePublicClient,
      }),
    ).rejects.toThrow(/amount/i);
  });
});
