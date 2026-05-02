// KH_BASE_URL defaults to local dev KeeperHub. Override via env for production.
import { randomBytes, createHash } from "node:crypto";
import { khAuthStateStore } from "./khAuthStateStore";
import { khClientStore } from "./khClientStore";
import { khTokenStore } from "./khTokenStore";

export const KH_BASE = process.env.KH_BASE_URL ?? "http://localhost:5347";

type OAuthMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
};

let cachedMetadata: OAuthMetadata | null = null;

export async function discoverMetadata(): Promise<OAuthMetadata> {
  if (cachedMetadata) return cachedMetadata;
  const res = await fetch(`${KH_BASE}/.well-known/oauth-authorization-server`);
  if (!res.ok) throw new Error(`KH metadata discovery failed: ${res.status}`);
  cachedMetadata = (await res.json()) as OAuthMetadata;
  return cachedMetadata;
}

export async function ensureClient(redirectUri: string): Promise<{ client_id: string; client_secret?: string }> {
  const cached = khClientStore.get();
  if (cached && cached.registeredFor === redirectUri) {
    return { client_id: cached.client_id, client_secret: cached.client_secret };
  }

  const meta = await discoverMetadata();
  const res = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "wishd",
      redirect_uris: [redirectUri],
      scope: "mcp:write",
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) throw new Error(`KH DCR failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { client_id: string; client_secret?: string };
  khClientStore.set({ client_id: data.client_id, client_secret: data.client_secret, registeredFor: redirectUri });
  return { client_id: data.client_id, client_secret: data.client_secret };
}

function generateCodeVerifier(): string {
  // RFC 7636: URL-safe random string, 32 bytes → 43 base64url chars
  return randomBytes(32).toString("base64url");
}

function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function buildAuthUrl(args: { redirectUri: string; scope: string }): Promise<{ authUrl: string; state: string }> {
  const { redirectUri, scope } = args;
  const meta = await discoverMetadata();
  const client = await ensureClient(redirectUri);

  const state = randomBytes(32).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);

  khAuthStateStore.put(state, { codeVerifier, redirectUri, createdAt: Date.now() });

  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { authUrl: url.toString(), state };
}

export async function exchangeCode(args: { code: string; state: string }): Promise<void> {
  const entry = khAuthStateStore.take(args.state);
  if (!entry) throw new Error("unknown or expired OAuth state");

  const meta = await discoverMetadata();
  const client = khClientStore.get();
  if (!client) throw new Error("no registered KH client — call ensureClient first");

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    code_verifier: entry.codeVerifier,
    redirect_uri: entry.redirectUri,
    client_id: client.client_id,
  });

  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`KH token exchange failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
  };

  khTokenStore.set({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  });
}

export async function refreshToken(): Promise<boolean> {
  const tok = khTokenStore.getRaw();
  if (!tok?.refreshToken) return false;

  const meta = await discoverMetadata();
  const client = khClientStore.get();
  if (!client) return false;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tok.refreshToken,
    client_id: client.client_id,
  });

  try {
    const res = await fetch(meta.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      scope: string;
    };

    khTokenStore.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? tok.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    });
    return true;
  } catch {
    return false;
  }
}
