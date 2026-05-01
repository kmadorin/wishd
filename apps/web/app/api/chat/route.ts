import type { ServerEvent } from "@wishd/plugin-sdk";
import { runAgent } from "../../../server/runAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const enc = new TextEncoder();

      const emit = (e: ServerEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      };

      await runAgent({
        wish: body.wish,
        account: body.account ?? { address: "0x0000000000000000000000000000000000000000", chainId: 11155111 },
        context: body.context,
        emit,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
