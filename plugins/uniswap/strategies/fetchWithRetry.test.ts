// plugins/uniswap/strategies/fetchWithRetry.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry";

describe("fetchWithRetry", () => {
  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const r = await fetchWithRetry("https://x", { method: "POST" }, { maxRetries: 3, baseDelayMs: 1, capDelayMs: 5, totalBudgetMs: 1000, fetchImpl: fetchMock as any });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4xx other than 429 fails immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("bad", { status: 400 }));
    await expect(fetchWithRetry("https://x", {}, { maxRetries: 5, baseDelayMs: 1, fetchImpl: fetchMock as any }))
      .rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries on persistent 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("x", { status: 503 }));
    await expect(fetchWithRetry("https://x", {}, { maxRetries: 2, baseDelayMs: 1, fetchImpl: fetchMock as any })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
