import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { useBalances } from "@/lib/useBalances";

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

describe("useBalances", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ balances: { ETH: "0.842", USDC: "30" }, missing: [] }), { status: 200 }),
    );
  });

  it("returns balances map after fetch", async () => {
    const { result } = renderHook(
      () => useBalances({ chainId: 1, address: "0x0000000000000000000000000000000000000001", tokens: ["ETH", "USDC"] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.balances).toEqual({ ETH: "0.842", USDC: "30" }));
  });

  it("returns empty map when address is undefined (no fetch)", async () => {
    const { result } = renderHook(
      () => useBalances({ chainId: 1, address: undefined, tokens: ["ETH"] }),
      { wrapper },
    );
    expect(result.current.balances).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
