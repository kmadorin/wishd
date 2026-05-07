import { describe, it, expect, vi, afterEach } from "vitest";
import { evmPublicClientFor, lifiFetch } from "./lifiClients";

describe("evmPublicClientFor", () => {
  it("returns a PublicClient for eip155:1 with chain.id === 1", () => {
    const client = evmPublicClientFor("eip155:1");
    expect(client.chain?.id).toBe(1);
  });

  it("returns a PublicClient for eip155:8453 with chain.id === 8453", () => {
    const client = evmPublicClientFor("eip155:8453");
    expect(client.chain?.id).toBe(8453);
  });

  it("throws for unsupported chain eip155:9999", () => {
    expect(() => evmPublicClientFor("eip155:9999")).toThrowError(/unsupported chain/i);
  });

  it("throws for non-EVM solana caip2", () => {
    expect(() => evmPublicClientFor("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toThrowError(/not an EVM/i);
  });
});

describe("lifiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LIFI_API_KEY;
  });

  it("constructs correct URL and returns parsed JSON", async () => {
    const mockData = { status: "PENDING" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as any);

    const result = await lifiFetch("/quote", { search: { fromChain: 1 } });

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url] = (global.fetch as any).mock.calls[0];
    expect(url).toBe("https://li.quest/v1/quote?fromChain=1");
    expect(result).toEqual(mockData);
  });

  it("sends x-lifi-api-key header when LIFI_API_KEY is set", async () => {
    process.env.LIFI_API_KEY = "test-api-key-123";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as any);

    await lifiFetch("/status", { search: { txHash: "0xabc" } });

    const [, init] = (global.fetch as any).mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-lifi-api-key"]).toBe("test-api-key-123");
  });

  it("does NOT send x-lifi-api-key header when LIFI_API_KEY is not set", async () => {
    delete process.env.LIFI_API_KEY;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as any);

    await lifiFetch("/tokens", {});

    const [, init] = (global.fetch as any).mock.calls[0];
    const headers = (init?.headers as Record<string, string>) ?? {};
    expect(headers["x-lifi-api-key"]).toBeUndefined();
  });

  it("throws an Error containing status code and body text on non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    } as any);

    await expect(lifiFetch("/quote", {})).rejects.toThrowError(/429/);
    await expect(lifiFetch("/quote", {})).rejects.toThrowError(/Rate limit exceeded/);
  });
});
