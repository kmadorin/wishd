import { describe, it, expect } from "vitest";
import { dispatchIntent } from "./intentDispatch";

const dummyClient = { readContract: async () => 0n } as any;

describe("dispatchIntent — demo intents", () => {
  it("demo.borrow returns borrow-demo widget with passed props", async () => {
    const out = await dispatchIntent("demo.borrow", {
      body: { amount: "0.05", asset: "ETH", collateral: "USDC", protocol: "aave-v3", chain: "ethereum-sepolia", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    expect(out.widget.type).toBe("borrow-demo");
    expect(out.widget.props).toMatchObject({ amount: "0.05", asset: "ETH", protocol: "aave-v3" });
  });
  it("demo.bridge returns bridge-demo with from/to chains", async () => {
    const out = await dispatchIntent("demo.bridge", {
      body: { amount: "0.05", asset: "ETH", fromChain: "ethereum", toChain: "base", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    expect(out.widget.type).toBe("bridge-demo");
    expect(out.widget.props).toMatchObject({ fromChain: "ethereum", toChain: "base" });
  });
});
