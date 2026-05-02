import { NextResponse } from "next/server";
import { ensureClient, buildAuthUrl } from "@/server/keepers/khOAuth";

export async function POST(request: Request): Promise<Response> {
  try {
    const redirectUri = `${new URL(request.url).origin}/api/keepers/kh-callback`;
    await ensureClient(redirectUri);
    const { authUrl, state } = await buildAuthUrl({ redirectUri, scope: "mcp:write" });
    return NextResponse.json({ authUrl, state });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
