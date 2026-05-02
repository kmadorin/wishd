import { describe, it, expect, vi, beforeEach } from "vitest";

// Adaptation: the export is `publicClientFor`, not `publicClient`
vi.mock("@/server/uniswapClients", () => ({
  publicClientFor: vi.fn(),
}));

import { publicClientFor } from "@/server/uniswapClients";
import { GET } from "@/app/api/wallet/balances/route";

describe("GET /api/wallet/balances", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400s when address is missing", async () => {
    const req = new Request("http://x/api/wallet/balances?chainId=1&tokens=ETH");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("400s when chainId is missing", async () => {
    const req = new Request(
      "http://x/api/wallet/balances?address=0x0000000000000000000000000000000000000001&tokens=ETH",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("400s when chainId is non-numeric", async () => {
    const req = new Request(
      "http://x/api/wallet/balances?address=0x0000000000000000000000000000000000000001&chainId=abc&tokens=ETH",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns native + erc20 balances scaled by decimals", async () => {
    const fake = {
      getBalance: vi.fn().mockResolvedValue(842_000_000_000_000_000n), // 0.842 ETH
      multicall: vi.fn().mockResolvedValue([
        { status: "success", result: 1_248_550_000n }, // USDC = 1248.55 (6 decimals)
      ]),
    };
    (publicClientFor as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fake);

    const req = new Request(
      "http://x/api/wallet/balances?address=0x0000000000000000000000000000000000000001&chainId=1&tokens=ETH,USDC",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.balances.ETH).toBe("0.842");
    expect(j.balances.USDC).toBe("1248.55");
  });
});
