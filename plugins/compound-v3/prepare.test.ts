import { describe, it, expect, vi } from "vitest";
import { prepareDeposit, prepareWithdraw } from "./prepare";
import { COMPOUND_ADDRESSES } from "./addresses";

const FAKE_USER = "0x0000000000000000000000000000000000000001" as const;

function fakeClient({ allowance, balance }: { allowance: bigint; balance: bigint }) {
  return {
    readContract: vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "allowance") return allowance;
      if (functionName === "balanceOf") return balance;
      throw new Error(`unexpected fn ${functionName}`);
    }),
  } as any;
}

function withdrawClient(supplied: bigint) {
  return {
    readContract: vi.fn().mockImplementation(async ({ functionName, address }: any) => {
      if (functionName === "balanceOf" && address === COMPOUND_ADDRESSES[11155111]!.Comet) {
        return supplied;
      }
      throw new Error(`unexpected ${functionName} on ${address}`);
    }),
  } as any;
}

describe("prepareDeposit", () => {
  it("emits approve + supply when allowance is zero and balance is sufficient", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient({ allowance: 0n, balance: 100_000_000n }),
    });
    expect(out.calls).toHaveLength(2);
    expect(out.meta.needsApprove).toBe(true);
    expect(out.meta.insufficient).toBe(false);
    expect(out.meta.amountWei).toBe("0x" + (10_000_000n).toString(16));
    expect(out.meta.balance).toBe("100");
    expect(out.meta.asset).toBe("USDC");
    expect(out.meta.market).toBe("cUSDCv3");
  });

  it("emits supply only when allowance is sufficient", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient({ allowance: 100_000_000n, balance: 100_000_000n }),
    });
    expect(out.calls).toHaveLength(1);
    expect(out.meta.needsApprove).toBe(false);
    expect(out.meta.insufficient).toBe(false);
  });

  it("flags insufficient when balance < amount", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient({ allowance: 0n, balance: 5_000_000n }),
    });
    expect(out.meta.insufficient).toBe(true);
    expect(out.meta.balance).toBe("5");
  });

  it("throws on unsupported chain", async () => {
    await expect(
      prepareDeposit({
        amount: "1",
        user: FAKE_USER,
        chainId: 1,
        publicClient: fakeClient({ allowance: 0n, balance: 0n }),
      }),
    ).rejects.toThrow(/unsupported chain/i);
  });
});

describe("prepareWithdraw", () => {
  it("emits a single Comet.withdraw call when supplied is sufficient", async () => {
    const out = await prepareWithdraw({
      amount: "5",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: withdrawClient(50_000_000n),
    });
    expect(out.calls).toHaveLength(1);
    expect(out.meta.insufficient).toBe(false);
    expect(out.meta.supplied).toBe("50");
    expect(out.meta.amountWei).toBe("0x" + (5_000_000n).toString(16));
    expect(out.meta.market).toBe("cUSDCv3");
  });

  it("flags insufficient when supplied < amount", async () => {
    const out = await prepareWithdraw({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: withdrawClient(2_000_000n),
    });
    expect(out.meta.insufficient).toBe(true);
    expect(out.meta.supplied).toBe("2");
  });

  it("throws on unsupported chain", async () => {
    await expect(
      prepareWithdraw({
        amount: "1",
        user: FAKE_USER,
        chainId: 1,
        publicClient: withdrawClient(0n),
      }),
    ).rejects.toThrow(/unsupported chain/i);
  });
});
