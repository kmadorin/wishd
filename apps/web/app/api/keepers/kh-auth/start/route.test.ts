import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("POST /api/keepers/kh-auth/start", () => {
  it("returns 200 with authUrl and state on success", async () => {
    vi.doMock("@/server/keepers/khOAuth", () => ({
      ensureClient: vi.fn().mockResolvedValue({ client_id: "test-client" }),
      buildAuthUrl: vi.fn().mockResolvedValue({
        authUrl: "http://localhost:5347/oauth/authorize?client_id=test-client&state=abc123",
        state: "abc123",
      }),
    }));

    const { POST } = await import("./route");
    const req = new Request("http://localhost:3000/api/keepers/kh-auth/start", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("authUrl");
    expect(body.authUrl).toContain("oauth/authorize");
    expect(body).toHaveProperty("state", "abc123");
  });

  it("returns 500 when ensureClient throws", async () => {
    vi.doMock("@/server/keepers/khOAuth", () => ({
      ensureClient: vi.fn().mockRejectedValue(new Error("KH DCR failed: 503")),
      buildAuthUrl: vi.fn(),
    }));

    const { POST } = await import("./route");
    const req = new Request("http://localhost:3000/api/keepers/kh-auth/start", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("KH DCR failed");
  });
});
