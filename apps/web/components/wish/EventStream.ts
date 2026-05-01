import type { ServerEvent } from "@wishd/plugin-sdk";

export type ParseResult = {
  events: ServerEvent[];
  rest: string;
};

export function parseSseChunk(buffer: string): ParseResult {
  const events: ServerEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const dataLines = part
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice("data: ".length));
    if (dataLines.length === 0) continue;
    try {
      events.push(JSON.parse(dataLines.join("\n")) as ServerEvent);
    } catch {
      // skip malformed
    }
  }
  return { events, rest };
}

export type StartStreamArgs = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  onEvent: (e: ServerEvent) => void;
  signal?: AbortSignal;
};

export async function startStream(args: StartStreamArgs): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wish: args.wish, account: args.account, context: args.context }),
    signal: args.signal,
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    for (const ev of events) args.onEvent(ev);
  }
}
