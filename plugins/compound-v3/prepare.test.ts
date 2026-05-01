import { describe, it, expect, vi } from "vitest";
import { prepareDeposit } from "./prepare";

const FAKE_USER = "0x0000000000000000000000000000000000000001" as const;

function fakeClient(allowance: bigint) {
  return {
    readContract: vi.fn().mockResolvedValue(allowance),
  } as any;
}

describe("prepareDeposit", () => {
  it("emits approve + supply when allowance is zero", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient(0n),
    });
    expect(out.calls).toHaveLength(2);
    expect(out.meta.needsApprove).toBe(true);
    expect(out.meta.amountWei).toBe("0x" + (10_000_000n).toString(16));
    expect(out.meta.asset).toBe("USDC");
    expect(out.meta.market).toBe("cUSDCv3");
  });

  it("emits supply only when allowance is sufficient", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient(100_000_000n),
    });
    expect(out.calls).toHaveLength(1);
    expect(out.meta.needsApprove).toBe(false);
  });

  it("throws on unsupported chain", async () => {
    await expect(
      prepareDeposit({
        amount: "1",
        user: FAKE_USER,
        chainId: 1,
        publicClient: fakeClient(0n),
      }),
    ).rejects.toThrow(/unsupported chain/i);
  });
});
