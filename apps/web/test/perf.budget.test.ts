import { describe, it, expect } from "vitest";

const RPC = process.env.SEPOLIA_RPC_URL;
const ADDR = process.env.WISHD_PERF_TEST_ADDRESS;
const APP = process.env.WISHD_APP_URL ?? "http://localhost:3000";

const enabled = Boolean(RPC && ADDR);

describe.skipIf(!enabled)("/api/prepare latency budget", () => {
  it("compound-v3.deposit responds under 2.5s", async () => {
    const t0 = Date.now();
    const res = await fetch(`${APP}/api/prepare/compound-v3.deposit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "1", asset: "USDC", chain: "ethereum-sepolia", address: ADDR }),
    });
    const elapsed = Date.now() - t0;
    expect(res.status, await res.text()).toBe(200);
    expect(elapsed).toBeLessThan(2500);
  }, 5000);
});
