export type PrepareResponse = {
  prepared: unknown;
  widget: { id: string; type: string; slot: "flow"; props: Record<string, unknown> };
};

export class PrepareError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PrepareError";
    this.status = status;
  }
}

export async function prepareIntent(
  intent: string,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<PrepareResponse> {
  const t0 = performance.now();
  const res = await fetch(`/api/prepare/${encodeURIComponent(intent)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new PrepareError(res.status, msg);
  }
  const out = (await res.json()) as PrepareResponse;
  if (typeof console !== "undefined") {
    console.info(
      JSON.stringify({
        tag: "wishd:perf",
        event: "prepare-roundtrip-ms",
        intent,
        ms: Math.round(performance.now() - t0),
      }),
    );
  }
  return out;
}
