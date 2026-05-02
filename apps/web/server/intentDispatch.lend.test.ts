import { describe, it, expect, vi } from "vitest";
import { dispatchIntent } from "./intentDispatch";

vi.mock("@plugins/compound-v3/prepare", async (orig) => {
  const real = await orig<typeof import("@plugins/compound-v3/prepare")>();
  return {
    ...real,
    prepareDeposit: vi.fn(async () => ({
      meta: { needsApprove: false, amountWei: "10000000", balance: "20000000", insufficient: false },
      calls: [],
    })),
  };
});

const dummyClient = { readContract: async () => 0n } as any;

describe("dispatchIntent — compound-v3.lend", () => {
  it("compound-v3 protocol routes to compound-summary widget", async () => {
    const out = await dispatchIntent("compound-v3.lend", {
      body: { amount: "10", asset: "USDC", protocol: "compound-v3", chain: "ethereum-sepolia", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    expect(out.widget.type).toBe("compound-summary");
  });
  it("non-compound protocol returns demo-style stub widget", async () => {
    const out = await dispatchIntent("compound-v3.lend", {
      body: { amount: "10", asset: "USDC", protocol: "aave-v3", chain: "ethereum-sepolia", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    // Earn widget reused for non-compound lend stubs (vault-list shape works).
    expect(out.widget.type).toBe("earn-demo");
    expect(out.widget.props).toMatchObject({ protocol: "aave-v3" });
  });
});
