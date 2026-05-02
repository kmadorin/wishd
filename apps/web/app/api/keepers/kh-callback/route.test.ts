import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { khTokenStore } from "@/server/keepers/khTokenStore";
import { khAuthStateStore } from "@/server/keepers/khAuthStateStore";
import { khClientStore } from "@/server/keepers/khClientStore";

beforeEach(() => {
  vi.restoreAllMocks();
  khTokenStore.clear();
  khClientStore.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes(".well-known")) {
      return new Response(
        JSON.stringify({
          issuer: "http://localhost:5347",
          authorization_endpoint: "http://localhost:5347/oauth/authorize",
          token_endpoint: "http://localhost:5347/api/oauth/token",
          registration_endpoint: "http://localhost:5347/api/oauth/register",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/oauth/token")) {
      return new Response(
        JSON.stringify({
          access_token: "at-test",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "rt-test",
          scope: "mcp:write",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
}

describe("GET /api/keepers/kh-callback", () => {
  it("returns HTML with postMessage on success and writes token to khTokenStore", async () => {
    const fakeState = "aabbcc".repeat(10).slice(0, 64);
    const redirectUri = "http://localhost:3000/api/keepers/kh-callback";
    khAuthStateStore.put(fakeState, {
      codeVerifier: "verifier-value",
      redirectUri,
      createdAt: Date.now(),
    });
    khClientStore.set({ client_id: "cid", registeredFor: redirectUri });
    mockFetch();

    const url = `http://localhost:3000/api/keepers/kh-callback?code=authcode&state=${fakeState}`;
    const res = await GET(new Request(url));

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("postMessage");
    expect(html).toContain("wishd:kh:authed");
    expect(html).toContain("KeeperHub connected");

    const tok = khTokenStore.getRaw();
    expect(tok?.accessToken).toBe("at-test");
  });

  it("returns error HTML on ?error param", async () => {
    const url = "http://localhost:3000/api/keepers/kh-callback?error=access_denied";
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("wishd:kh:auth-error");
    expect(html).toContain("access_denied");
  });

  it("returns 400 HTML when code or state are missing", async () => {
    const url = "http://localhost:3000/api/keepers/kh-callback";
    const res = await GET(new Request(url));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("wishd:kh:auth-error");
  });
});
