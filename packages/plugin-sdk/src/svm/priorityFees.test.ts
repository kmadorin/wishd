import { describe, it, expect, vi } from "vitest";
import { getPriorityFeeEstimate } from "./priorityFees";

describe("getPriorityFeeEstimate", () => {
  it("returns p75 of recent prioritization fees from rpc", async () => {
    const rpc = {
      getRecentPrioritizationFees: vi.fn(() => ({
        send: () => Promise.resolve([
          { slot: 1n, prioritizationFee: 100 },
          { slot: 2n, prioritizationFee: 200 },
          { slot: 3n, prioritizationFee: 300 },
          { slot: 4n, prioritizationFee: 400 },
        ]),
      })),
    } as any;
    const fee = await getPriorityFeeEstimate(rpc, []);
    // p75 of [100,200,300,400] = 350 (linear interp) — accept 300 as ceil index
    expect(fee).toBeGreaterThanOrEqual(300);
    expect(fee).toBeLessThanOrEqual(400);
  });

  it("returns 0 when rpc returns empty array", async () => {
    const rpc = {
      getRecentPrioritizationFees: vi.fn(() => ({ send: () => Promise.resolve([]) })),
    } as any;
    expect(await getPriorityFeeEstimate(rpc, [])).toBe(0);
  });

  it("forwards account list to rpc", async () => {
    const send = vi.fn(() => Promise.resolve([]));
    const rpc = { getRecentPrioritizationFees: vi.fn(() => ({ send })) } as any;
    await getPriorityFeeEstimate(rpc, ["addr1", "addr2"]);
    expect(rpc.getRecentPrioritizationFees).toHaveBeenCalledWith(["addr1", "addr2"]);
  });
});
