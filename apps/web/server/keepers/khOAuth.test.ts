import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use consistent singleton stores — do NOT resetModules so the same store instance
// is used both by the test helpers and by the imported khOAuth module.
import { khTokenStore } from "./khTokenStore";
import { khClientStore } from "./khClientStore";
import { khAuthStateStore } from "./khAuthStateStore";
import { buildAuthUrl, exchangeCode } from "./khOAuth";

// Reset module-level metadata cache and stores between tests
let cachedMetadata: unknown = null;
beforeEach(() => {
  vi.restoreAllMocks();
  khClientStore.clear();
  khTokenStore.clear();
  // Invalidate the module-level metadata cache by mocking fetch to always re-discover.
  // (We can't directly reset the module variable, so we rely on the fetch mock being consistent.)
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes(".well-known")) {
      return new Response(
        JSON.stringify({
          issuer: "http://localhost:5347",
          authorization_endpoint: "http://localhost:5347/oauth/authorize",
          token_endpoint: "http://localhost:5347/api/oauth/token",
          registration_endpoint: "http://localhost:5347/api/oauth/register",
          ...overrides,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/oauth/register")) {
      return new Response(JSON.stringify({ client_id: "test-client-id" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/oauth/token")) {
      return new Response(
        JSON.stringify({
          access_token: "access-abc",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "refresh-xyz",
          scope: "mcp:write",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
}

describe("buildAuthUrl", () => {
  it("includes state, scope, code_challenge, and code_challenge_method=S256 in the URL", async () => {
    mockFetch();
    const { authUrl, state } = await buildAuthUrl({ redirectUri: "http://localhost:3000/callback", scope: "mcp:write" });

    const parsed = new URL(authUrl);
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(parsed.searchParams.get("scope")).toBe("mcp:write");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
    expect(parsed.searchParams.get("code_challenge")).not.toBe("");
    expect(state).toHaveLength(64); // 32 bytes hex
  });

  it("stores state entry in khAuthStateStore so take() returns it", async () => {
    mockFetch();
    const { state } = await buildAuthUrl({ redirectUri: "http://localhost:3000/cb2", scope: "mcp:write" });
    const entry = khAuthStateStore.take(state);
    expect(entry).not.toBeNull();
    expect(entry!.codeVerifier).toBeTruthy();
    expect(entry!.redirectUri).toBe("http://localhost:3000/cb2");
  });
});

describe("exchangeCode", () => {
  it("writes access token to khTokenStore on success", async () => {
    mockFetch();
    // Must pre-populate client store and auth state store (same singleton as khOAuth uses)
    khClientStore.set({ client_id: "test-client", registeredFor: "http://localhost:3000/callback" });
    // Build a real state entry via buildAuthUrl so codeVerifier is consistent
    const { state } = await buildAuthUrl({ redirectUri: "http://localhost:3000/callback", scope: "mcp:write" });

    await exchangeCode({ code: "auth-code-123", state });

    const tok = khTokenStore.getRaw();
    expect(tok).not.toBeNull();
    expect(tok!.accessToken).toBe("access-abc");
    expect(tok!.refreshToken).toBe("refresh-xyz");
    expect(tok!.scope).toBe("mcp:write");
    expect(tok!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws on unknown state", async () => {
    await expect(exchangeCode({ code: "x", state: "unknown-state" })).rejects.toThrow("unknown or expired OAuth state");
  });
});
