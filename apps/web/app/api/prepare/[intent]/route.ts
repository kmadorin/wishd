import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { dispatchIntent } from "@/server/intentDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ intent: string }> },
): Promise<Response> {
  const { intent } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const t0 = Date.now();
  try {
    const out = await dispatchIntent(intent, { body, publicClient });
    console.info(JSON.stringify({ tag: "wishd:perf", event: "prepare-roundtrip-ms", intent, ms: Date.now() - t0 }));
    return Response.json(out, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unknown intent/i.test(msg)) return Response.json({ error: msg }, { status: 404 });
    if (/required|unsupported chain|amount/i.test(msg)) return Response.json({ error: msg }, { status: 400 });
    if (/insufficient/i.test(msg)) return Response.json({ error: msg }, { status: 422 });
    console.error("prepare route failure", err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
