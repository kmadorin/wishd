import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveClaimant } from "./prepareIntent";
import type { RegisteredIntent } from "./intentRegistry.client";
import { prepareIntent, PrepareError } from "./prepareIntent";

describe("prepareIntent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to /api/prepare/[intent] and returns parsed body on 200", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          prepared: { meta: {} },
          widget: { id: "w_1", type: "compound-summary", slot: "flow", props: {} },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await prepareIntent("compound-v3.deposit", { amount: "10" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prepare/compound-v3.deposit",
      expect.objectContaining({ method: "POST" }),
    );
    expect(out.widget.id).toBe("w_1");
  });

  it("throws PrepareError with status on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 502 })),
    );
    await expect(prepareIntent("compound-v3.deposit", {})).rejects.toMatchObject({
      name: "PrepareError",
      status: 502,
      message: "boom",
    });
  });
});

const evmSwap: RegisteredIntent = {
  pluginName: "uniswap",
  schema: {
    intent: "uniswap.swap", verb: "swap", description: "", widget: "w",
    fields: [{ key: "chain", type: "chain", required: true, default: "eip155:1", options: ["eip155:1", "eip155:8453"] }],
  },
};
const svmSwap: RegisteredIntent = {
  pluginName: "jupiter",
  schema: {
    intent: "jupiter.swap", verb: "swap", description: "", widget: "w",
    fields: [{ key: "chain", type: "chain", required: true, default: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", options: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] }],
  },
};

describe("resolveClaimant", () => {
  it("single claimant short-circuits", () => {
    expect(resolveClaimant([evmSwap], { connectedFamilies: ["evm"], values: { chain: "eip155:1" } }).pluginName).toBe("uniswap");
  });

  it("disambiguates by chain field family when EVM connected", () => {
    const r = resolveClaimant([evmSwap, svmSwap], { connectedFamilies: ["evm"], values: { chain: "eip155:1" } });
    expect(r.pluginName).toBe("uniswap");
  });

  it("disambiguates by chain field family when SVM connected", () => {
    const r = resolveClaimant([evmSwap, svmSwap], { connectedFamilies: ["svm"], values: { chain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" } });
    expect(r.pluginName).toBe("jupiter");
  });

  it("throws when both wallets connected and both families claim", () => {
    expect(() =>
      resolveClaimant([evmSwap, svmSwap], { connectedFamilies: ["evm", "svm"], values: { chain: "eip155:1" } }),
    ).toThrow(/ambiguous/i);
  });

  it("throws when zero claimants", () => {
    expect(() => resolveClaimant([], { connectedFamilies: ["evm"], values: {} })).toThrow(/no plugin claims/i);
  });
});
