import { describe, it, expect, vi, afterEach } from "vitest";
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
